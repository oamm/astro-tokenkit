// packages/astro-tokenkit/src/auth/manager.ts

import {APIResponse, AuthError} from '../types';
import type { TokenBundle, Session, AuthConfig, TokenKitContext, AuthOptions, LoginOptions } from '../types';
import { autoDetectFields, parseJWTPayload } from './detector';
import { storeTokens, retrieveTokens, retrieveCookieTokens, clearTokens, clearCookieTokens } from './storage';
import { shouldRefresh, isExpired } from './policy';
import { safeFetch } from '../utils/fetch';
import { logger } from '../utils/logger';

/**
 * Single-flight refresh manager
 */
class SingleFlight {
    private inFlight = new Map<string, Promise<TokenBundle | null>>();
    private recent = new Map<string, { bundle: TokenBundle | null, time: number }>();
    private readonly GRACE_PERIOD = 5000; // 5 seconds grace period for race conditions

    async execute(
        key: string,
        fn: () => Promise<TokenBundle | null>
    ): Promise<TokenBundle | null> {
        // 1. Check in-flight
        const existing = this.inFlight.get(key);
        if (existing) return existing;

        // 2. Check recent (grace period)
        const cached = this.recent.get(key);
        if (cached && (Date.now() - cached.time < this.GRACE_PERIOD)) {
            return cached.bundle;
        }

        // 3. Execute new flight
        const promise = (async () => {
            try {
                const bundle = await fn();
                // Store in recent on success
                if (bundle) {
                    this.recent.set(key, { bundle, time: Date.now() });
                }
                return bundle;
            } finally {
                this.inFlight.delete(key);
                
                // Cleanup old entries
                const now = Date.now();
                for (const [k, v] of this.recent.entries()) {
                    if (now - v.time > this.GRACE_PERIOD) {
                        this.recent.delete(k);
                    }
                }
            }
        })();

        this.inFlight.set(key, promise);
        return promise;
    }
}

/**
 * Token Manager handles all token operations
 */
export class TokenManager {
    private singleFlight = new SingleFlight();
    private baseURL: string;

    constructor(
        private config: AuthConfig,
        baseURL: string
    ) {
        this.baseURL = baseURL;
    }

    /**
     * Perform login
     */
    async login(ctx: TokenKitContext, credentials: any, options?: LoginOptions): Promise<APIResponse<TokenBundle>> {
        const url = this.joinURL(this.baseURL, this.config.login);

        const contentType = this.config.contentType || 'application/json';
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            ...this.config.headers,
            ...options?.headers,
        };

        const data = {
            ...this.config.loginData,
            ...options?.data,
            ...credentials,
        };

        let requestBody: string;
        if (contentType === 'application/x-www-form-urlencoded') {
            requestBody = new URLSearchParams(data).toString();
        } else {
            requestBody = JSON.stringify(data);
        }

        const timeout = options?.timeout ?? this.config.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let response: Response;
        try {
            response = await safeFetch(url, {
                method: 'POST',
                headers,
                body: requestBody,
                signal: controller.signal,
            }, this.config);
        } catch (error: any) {
            const authError = new AuthError(`Login request failed: ${error.message}`, undefined, undefined, undefined, error);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const authError = new AuthError(`Login failed: ${response.status} ${response.statusText}`, response.status, response);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        }

        const body = await response.json().catch(() => ({}));

        // Parse response
        let bundle: TokenBundle;
        try {
            bundle = this.config.parseLogin
                ? this.config.parseLogin(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            const authError = new AuthError(`Invalid login response: ${error.message}`, response.status, response);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        }

        // Store in the configured backend
        await this.storeTokens(ctx, bundle);

        // Call onLogin callback if provided
        if (options?.onLogin) {
            await options.onLogin(bundle, body, ctx);
        }

        return {
            data: bundle,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            url: response.url,
            ok: response.ok,
        };
    }

    /**
     * Perform token refresh
     */
    async refresh(ctx: TokenKitContext, refreshToken: string, options?: AuthOptions, headers?: Record<string, string>): Promise<TokenBundle | null> {
        const flightKey = this.createFlightKey(refreshToken);
        return this.singleFlight.execute(flightKey, async () => {
            logger.debug('[TokenKit] Starting token refresh', !!this.config.debug);
            try {
                const bundle = await this.performRefresh(ctx, refreshToken, options, headers);
                if (bundle) {
                    if (this.config.onRefresh) {
                        await this.config.onRefresh(bundle, ctx);
                    }
                } else {
                    logger.debug('[TokenKit] Token refresh returned no bundle (invalid or expired)', !!this.config.debug);
                    if (this.config.onRefreshError) {
                        await this.config.onRefreshError(new AuthError('Refresh token invalid or expired', 401), ctx);
                    }
                }
                return bundle;
            } catch (error: any) {
                logger.debug(`[TokenKit] Token refresh failed: ${error.message}`, !!this.config.debug);
                if (this.config.onRefreshError) {
                    await this.config.onRefreshError(error, ctx);
                }
                throw error;
            }
        });
    }

    /**
     * Internal refresh implementation
     */
    private async performRefresh(ctx: TokenKitContext, refreshToken: string, options?: AuthOptions, extraHeaders?: Record<string, string>): Promise<TokenBundle | null> {
        const url = this.joinURL(this.baseURL, this.config.refresh);

        const contentType = this.config.contentType || 'application/json';
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            ...this.config.headers,
            ...extraHeaders,
        };

        const refreshField = this.config.refreshRequestField || 'refreshToken';
        const data = {
            ...this.config.refreshData,
            ...options?.data,
            [refreshField]: refreshToken,
        };

        let requestBody: string;
        if (contentType === 'application/x-www-form-urlencoded') {
            requestBody = new URLSearchParams(data).toString();
        } else {
            requestBody = JSON.stringify(data);
        }

        const timeout = options?.timeout ?? this.config.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let response: Response;
        try {
            response = await safeFetch(url, {
                method: 'POST',
                headers,
                body: requestBody,
                signal: controller.signal,
            }, this.config);
        } catch (error: any) {
            throw new AuthError(`Refresh request failed: ${error.message}`, undefined, undefined, undefined, error);
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            // 400 (Bad Request), 401 (Unauthorized) or 403 (Forbidden) = invalid refresh token
            if (response.status === 400 || response.status === 401 || response.status === 403) {
                await this.clearTokens(ctx);
                return null;
            }
            throw new AuthError(`Refresh failed: ${response.status} ${response.statusText}`, response.status, response);
        }

        const body = await response.json().catch(() => ({}));

        // Parse response
        let bundle: TokenBundle | null;
        try {
            bundle = this.config.parseRefresh
                ? this.config.parseRefresh(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            throw new AuthError(`Invalid refresh response: ${error.message}`, response.status, response);
        }

        if (!bundle) {
            await this.clearTokens(ctx);
            return null;
        }

        // Validate bundle
        if (!bundle.accessToken || !bundle.refreshToken || !bundle.accessExpiresAt) {
            throw new AuthError('Invalid token bundle returned from refresh endpoint', response.status, response);
        }

        // Store new tokens
        await this.storeTokens(ctx, bundle);

        return bundle;
    }

    /**
     * Ensure valid tokens (with automatic refresh)
     */
    async ensure(ctx: TokenKitContext, options?: AuthOptions, headers?: Record<string, string>, force: boolean = false): Promise<Session | null> {
        const now = Math.floor(Date.now() / 1000);
        const tokens = await this.retrieveTokens(ctx);

        // Refresh-token-only records can happen after the browser drops short-lived
        // access-token cookies. They are still refreshable and should not be
        // treated as an invalid app session.
        if (!this.hasRequiredTokens(tokens)) {
            if (tokens.refreshToken) {
                logger.debug('[TokenKit] Access token data missing, attempting refresh with refresh token', !!this.config.debug);
                const bundle = await this.refresh(ctx, tokens.refreshToken, options, headers);

                if (!bundle) {
                    logger.debug('[TokenKit] Refresh returned no bundle, session lost', !!this.config.debug);
                    return null;
                }

                await this.storeTokens(ctx, bundle);

                return {
                    accessToken: bundle.accessToken,
                    expiresAt: bundle.accessExpiresAt,
                    tokenType: bundle.tokenType,
                    payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
                };
            }

            logger.debug('[TokenKit] No valid session found, refresh impossible', !!this.config.debug);
            await this.clearTokens(ctx);
            if (this.config.onSessionInvalid) {
                await this.config.onSessionInvalid(new AuthError('No valid session found, refresh impossible', 401), ctx);
            }
            return null;
        }

        // Token expired or force refresh
        const expired = isExpired(tokens.expiresAt, now, this.config.policy);
        if (force || expired) {
            logger.debug(`[TokenKit] Token ${force ? 'force refresh' : 'expired'}, refreshing...`, !!this.config.debug);
            const bundle = await this.refresh(ctx, tokens.refreshToken!, options, headers);

            if (!bundle) {
                logger.debug('[TokenKit] Refresh returned no bundle, session lost', !!this.config.debug);
                return null;
            }

            // Ensure tokens are stored in the current context (in case of shared flight)
            await this.storeTokens(ctx, bundle);

            return {
                accessToken: bundle.accessToken,
                expiresAt: bundle.accessExpiresAt,
                tokenType: bundle.tokenType,
                payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
            };
        }

        // Proactive refresh
        if (shouldRefresh(tokens.expiresAt, now, tokens.lastRefreshAt, this.config.policy)) {
            logger.debug('[TokenKit] Token near expiration, performing proactive refresh', !!this.config.debug);

            try {
                const bundle = await this.refresh(ctx, tokens.refreshToken!, options, headers);

                if (bundle) {
                    logger.debug('[TokenKit] Proactive refresh successful', !!this.config.debug);
                    // Ensure tokens are stored in the current context (in case of shared flight)
                    await this.storeTokens(ctx, bundle);

                    return {
                        accessToken: bundle.accessToken,
                        expiresAt: bundle.accessExpiresAt,
                        tokenType: bundle.tokenType,
                        payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
                    };
                }
            } catch (error) {
                logger.debug(`[TokenKit] Proactive refresh failed: ${(error as Error).message}. Continuing with current token.`, !!this.config.debug);
            }

            // Refresh failed or returned no bundle, check if tokens still exist
            const currentTokens = await this.retrieveTokens(ctx);
            if (!this.hasRequiredTokens(currentTokens)) {
                await this.clearTokens(ctx);
                return null;
            }
        }

        // Return current session
        return this.toSession(tokens);
    }

    /**
     * Logout (clear tokens)
     */
    async logout(ctx: TokenKitContext): Promise<void> {
        // Optionally call logout endpoint
        if (this.config.logout) {
            const timeout = this.config.timeout ?? 10000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const url = this.joinURL(this.baseURL, this.config.logout);
                const session = await this.getSessionAsync(ctx);
                const headers: Record<string, string> = {};

                if (session?.accessToken) {
                    const injectFn = this.config.injectToken ?? ((token, type) => `${type ?? 'Bearer'} ${token}`);
                    headers['Authorization'] = injectFn(session.accessToken, session.tokenType);
                }

                await safeFetch(url, { 
                    method: 'POST', 
                    headers,
                    signal: controller.signal,
                }, this.config);
            } catch (error) {
                // Ignore logout endpoint errors
                logger.debug('[TokenKit] Logout endpoint failed:', !!this.config.debug, error);
            } finally {
                clearTimeout(timeoutId);
            }
        }

        await this.clearTokens(ctx);
    }

    /**
     * Clear stored TokenKit data without calling the configured logout endpoint.
     */
    async clear(ctx: TokenKitContext): Promise<void> {
        await this.clearTokens(ctx);
    }

    /**
     * Get current session (no refresh)
     */
    getSession(ctx: TokenKitContext): Session | null {
        const tokens = retrieveCookieTokens(ctx, this.config.cookies);

        if (!this.hasRequiredTokens(tokens) || isExpired(tokens.expiresAt, Math.floor(Date.now() / 1000), this.config.policy)) {
            clearCookieTokens(ctx, this.config.cookies);
            return null;
        }

        return this.toSession(tokens);
    }

    /**
     * Get current session (no refresh)
     */
    async getSessionAsync(ctx: TokenKitContext): Promise<Session | null> {
        const tokens = await this.retrieveTokens(ctx);

        if (!this.hasRequiredTokens(tokens) || isExpired(tokens.expiresAt, Math.floor(Date.now() / 1000), this.config.policy)) {
            await this.clearTokens(ctx);
            return null;
        }

        return this.toSession(tokens);
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(ctx: TokenKitContext): boolean {
        const tokens = retrieveCookieTokens(ctx, this.config.cookies);
        return !!(tokens.accessToken && tokens.refreshToken);
    }

    /**
     * Check if authenticated
     */
    async isAuthenticatedAsync(ctx: TokenKitContext): Promise<boolean> {
        const tokens = await this.retrieveTokens(ctx);
        return !!(tokens.accessToken && tokens.refreshToken);
    }

    /**
     * Create flight key for single-flight deduplication
     */
    private createFlightKey(token: string): string {
        // Avoid weak hashing of sensitive tokens
        return `refresh_${token}`;
    }

    private storeTokens(ctx: TokenKitContext, bundle: TokenBundle): Promise<void> {
        return storeTokens(ctx, bundle, this.config.cookies, this.config.storage);
    }

    private retrieveTokens(ctx: TokenKitContext) {
        return retrieveTokens(ctx, this.config.cookies, this.config.storage);
    }

    private clearTokens(ctx: TokenKitContext): Promise<void> {
        return clearTokens(ctx, this.config.cookies, this.config.storage);
    }

    private hasRequiredTokens(tokens: {
        accessToken: string | null;
        refreshToken: string | null;
        expiresAt: number | null;
    }): tokens is {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        lastRefreshAt?: number | null;
        tokenType?: string | null;
    } {
        return !!(tokens.accessToken && tokens.refreshToken && tokens.expiresAt);
    }

    private toSession(tokens: {
        accessToken: string;
        expiresAt: number;
        tokenType?: string | null;
    }): Session {
        return {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            tokenType: tokens.tokenType ?? undefined,
            payload: parseJWTPayload(tokens.accessToken) ?? undefined,
        };
    }

    /**
     * Join base URL and path safely
     */
    private joinURL(base: string, path: string): string {
        const b = base.endsWith('/') ? base : base + '/';
        const p = path.startsWith('/') ? path.slice(1) : path;
        return b + p;
    }
}

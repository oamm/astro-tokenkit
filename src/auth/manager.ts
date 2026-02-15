// packages/astro-tokenkit/src/auth/manager.ts

import {APIResponse, AuthError} from '../types';
import type { TokenBundle, Session, AuthConfig, TokenKitContext, AuthOptions, LoginOptions } from '../types';
import { autoDetectFields, parseJWTPayload } from './detector';
import { storeTokens, retrieveTokens, clearTokens } from './storage';
import { shouldRefresh, isExpired } from './policy';
import { safeFetch } from '../utils/fetch';
import { logger } from '../utils/logger';

/**
 * Single-flight refresh manager
 */
class SingleFlight {
    private inFlight = new Map<string, Promise<TokenBundle | null>>();

    async execute(
        key: string,
        fn: () => Promise<TokenBundle | null>
    ): Promise<TokenBundle | null> {
        const existing = this.inFlight.get(key);
        if (existing) return existing;

        const promise = (async () => {
            try {
                return await fn();
            } finally {
                this.inFlight.delete(key);
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

        // Store in cookies
        storeTokens(ctx, bundle, this.config.cookies);

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
        try {
            return await this.performRefresh(ctx, refreshToken, options, headers);
        } catch (error) {
            clearTokens(ctx, this.config.cookies);
            throw error;
        }
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
            // 401/403 = invalid refresh token
            if (response.status === 401 || response.status === 403) {
                clearTokens(ctx, this.config.cookies);
                return null;
            }
            throw new AuthError(`Refresh failed: ${response.status} ${response.statusText}`, response.status, response);
        }

        const body = await response.json().catch(() => ({}));

        // Parse response
        let bundle: TokenBundle;
        try {
            bundle = this.config.parseRefresh
                ? this.config.parseRefresh(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            throw new AuthError(`Invalid refresh response: ${error.message}`, response.status, response);
        }

        // Validate bundle
        if (!bundle.accessToken || !bundle.refreshToken || !bundle.accessExpiresAt) {
            throw new AuthError('Invalid token bundle returned from refresh endpoint', response.status, response);
        }

        // Store new tokens
        storeTokens(ctx, bundle, this.config.cookies);

        return bundle;
    }

    /**
     * Ensure valid tokens (with automatic refresh)
     */
    async ensure(ctx: TokenKitContext, options?: AuthOptions, headers?: Record<string, string>, force: boolean = false): Promise<Session | null> {
        const now = Math.floor(Date.now() / 1000);
        const tokens = retrieveTokens(ctx, this.config.cookies);

        // No tokens
        if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
            return null;
        }

        // Token expired or force refresh
        if (force || isExpired(tokens.expiresAt, now, this.config.policy)) {
            const flightKey = this.createFlightKey(tokens.refreshToken);
            const bundle = await this.singleFlight.execute(flightKey, () =>
                this.refresh(ctx, tokens.refreshToken!, options, headers)
            );

            if (!bundle) return null;

            // Ensure tokens are stored in the current context (in case of shared flight)
            storeTokens(ctx, bundle, this.config.cookies);

            return {
                accessToken: bundle.accessToken,
                expiresAt: bundle.accessExpiresAt,
                tokenType: bundle.tokenType,
                payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
            };
        }

        // Proactive refresh
        if (shouldRefresh(tokens.expiresAt, now, tokens.lastRefreshAt, this.config.policy)) {
            const flightKey = this.createFlightKey(tokens.refreshToken);
            const bundle = await this.singleFlight.execute(flightKey, () =>
                this.refresh(ctx, tokens.refreshToken!, options, headers)
            );

            if (bundle) {
                // Ensure tokens are stored in the current context (in case of shared flight)
                storeTokens(ctx, bundle, this.config.cookies);

                return {
                    accessToken: bundle.accessToken,
                    expiresAt: bundle.accessExpiresAt,
                    tokenType: bundle.tokenType,
                    payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
                };
            }

            // Refresh failed, check if tokens still exist
            const currentTokens = retrieveTokens(ctx, this.config.cookies);
            if (!currentTokens.accessToken) {
                return null;
            }
        }

        // Return current session
        return {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            tokenType: tokens.tokenType ?? undefined,
            payload: parseJWTPayload(tokens.accessToken) ?? undefined,
        };
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
                const session = this.getSession(ctx);
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
                logger.debug('[TokenKit] Logout endpoint failed:', error);
            } finally {
                clearTimeout(timeoutId);
            }
        }

        clearTokens(ctx, this.config.cookies);
    }

    /**
     * Get current session (no refresh)
     */
    getSession(ctx: TokenKitContext): Session | null {
        const tokens = retrieveTokens(ctx, this.config.cookies);

        if (!tokens.accessToken || !tokens.expiresAt) {
            return null;
        }

        return {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            tokenType: tokens.tokenType ?? undefined,
            payload: parseJWTPayload(tokens.accessToken) ?? undefined,
        };
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(ctx: TokenKitContext): boolean {
        const tokens = retrieveTokens(ctx, this.config.cookies);
        return !!(tokens.accessToken && tokens.refreshToken);
    }

    /**
     * Create flight key for single-flight deduplication
     */
    private createFlightKey(token: string): string {
        // Avoid weak hashing of sensitive tokens
        return `refresh_${token}`;
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
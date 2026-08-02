// packages/astro-tokenkit/src/auth/manager.ts

import {APIResponse, AuthError} from '../types';
import type { TokenBundle, Session, AuthConfig, TokenKitContext, AuthOptions, LoginOptions, HeaderResolverOperation } from '../types';
import { autoDetectFields, parseJWTPayload } from './detector';
import { storeTokens, retrieveTokens, retrieveCookieTokens, clearTokens, clearCookieTokens } from './storage';
import { normalizePolicy, shouldRefresh, isExpired } from './policy';
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
        const url = this.withQueryParams(
            this.joinURL(this.baseURL, this.config.login),
            this.config.loginParams,
            options?.params
        );

        const contentType = this.config.contentType || 'application/json';
        const resolvedHeaders = await this.resolveHeaders(ctx, 'login');
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            ...this.config.headers,
            ...resolvedHeaders,
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

        this.debugAuth('sending login request', {
            url,
            contentType,
            timeout,
            bodyKeys: Object.keys(data),
            headerKeys: Object.keys(headers),
            queryParamKeys: this.getMergedParamKeys(this.config.loginParams, options?.params),
        });

        let response: Response;
        const startedAt = Date.now();
        try {
            response = await safeFetch(url, {
                method: 'POST',
                headers,
                body: requestBody,
                signal: controller.signal,
            }, this.config);
        } catch (error: any) {
            this.debugAuth('login request threw before response', {
                elapsedMs: Date.now() - startedAt,
                message: error.message,
                name: error.name,
            });
            const authError = new AuthError(`Login request failed: ${error.message}`, undefined, undefined, undefined, error);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        } finally {
            clearTimeout(timeoutId);
        }

        this.debugAuth('login response received', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            url: response.url,
            elapsedMs: Date.now() - startedAt,
        });

        if (!response.ok) {
            const authError = new AuthError(`Login failed: ${response.status} ${response.statusText}`, response.status, response);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        }

        const body = await response.json().catch(() => ({}));
        this.debugAuth('login response body parsed', {
            parser: this.config.parseLogin ? 'custom' : 'auto-detect',
            bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        });

        // Parse response
        let bundle: TokenBundle;
        try {
            bundle = this.config.parseLogin
                ? this.config.parseLogin(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            this.debugAuth('login response parsing failed', {
                message: error.message,
                bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
            });
            const authError = new AuthError(`Invalid login response: ${error.message}`, response.status, response);
            if (options?.onError) await options.onError(authError, ctx);
            throw authError;
        }

        this.debugAuth('login bundle parsed', this.describeBundle(bundle));
        this.debugAuth('storing login tokens', {
            storage: this.getStorageType(),
            accessExpiresAt: bundle.accessExpiresAt,
            secondsUntilExpiry: bundle.accessExpiresAt - Math.floor(Date.now() / 1000),
        });

        // Store in the configured backend
        await this.storeTokens(ctx, bundle);
        this.debugAuth('login tokens stored', {
            storage: this.getStorageType(),
        });

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
        const resolvedHeaders = await this.resolveHeaders(ctx, 'refresh');
        const extraHeaders = {
            ...resolvedHeaders,
            ...headers,
        };
        const flightKey = this.createFlightKey(refreshToken, options, extraHeaders);
        this.debugRefresh('refresh requested', {
            refreshToken: this.describeToken(refreshToken),
            extraHeaderKeys: Object.keys(extraHeaders),
            hasOptionData: !!options?.data,
            timeout: options?.timeout ?? this.config.timeout ?? 30000,
        });
        return this.singleFlight.execute(flightKey, async () => {
            this.debugRefresh('single-flight execution started', {
                refreshToken: this.describeToken(refreshToken),
            });
            try {
                const bundle = await this.performRefresh(ctx, refreshToken, options, extraHeaders);
                if (bundle) {
                    this.debugRefresh('refresh succeeded', this.describeBundle(bundle));
                    if (this.config.onRefresh) {
                        this.debugRefresh('calling onRefresh callback');
                        await this.config.onRefresh(bundle, ctx);
                    }
                } else {
                    this.debugRefresh('refresh returned no bundle (invalid or expired)');
                    if (this.config.onRefreshError) {
                        this.debugRefresh('calling onRefreshError callback after empty refresh result');
                        await this.config.onRefreshError(new AuthError('Refresh token invalid or expired', 401), ctx);
                    }
                }
                return bundle;
            } catch (error: any) {
                this.debugRefresh('refresh failed', {
                    message: error.message,
                    status: error.status,
                    name: error.name,
                });
                if (this.config.onRefreshError) {
                    this.debugRefresh('calling onRefreshError callback after thrown refresh error');
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
        const url = this.withQueryParams(
            this.joinURL(this.baseURL, this.config.refresh),
            this.config.refreshParams,
            options?.params
        );

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
        const sanitizedDataKeys = Object.keys(data).map((key) => key === refreshField ? `${key}=[redacted]` : key);

        let requestBody: string;
        if (contentType === 'application/x-www-form-urlencoded') {
            requestBody = new URLSearchParams(data).toString();
        } else {
            requestBody = JSON.stringify(data);
        }

        const timeout = options?.timeout ?? this.config.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        this.debugRefresh('sending refresh request', {
            url,
            contentType,
            timeout,
            refreshField,
            bodyKeys: sanitizedDataKeys,
            headerKeys: Object.keys(headers),
            queryParamKeys: this.getMergedParamKeys(this.config.refreshParams, options?.params),
        });

        let response: Response;
        const startedAt = Date.now();
        try {
            response = await safeFetch(url, {
                method: 'POST',
                headers,
                body: requestBody,
                signal: controller.signal,
            }, this.config);
        } catch (error: any) {
            this.debugRefresh('refresh request threw before response', {
                elapsedMs: Date.now() - startedAt,
                message: error.message,
                name: error.name,
            });
            throw new AuthError(`Refresh request failed: ${error.message}`, undefined, undefined, undefined, error);
        } finally {
            clearTimeout(timeoutId);
        }

        this.debugRefresh('refresh response received', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            url: response.url,
            elapsedMs: Date.now() - startedAt,
        });

        if (!response.ok) {
            // 400 (Bad Request), 401 (Unauthorized) or 403 (Forbidden) = invalid refresh token
            if (response.status === 400 || response.status === 401 || response.status === 403) {
                this.debugRefresh('refresh token rejected by auth server, clearing stored tokens', {
                    status: response.status,
                    statusText: response.statusText,
                });
                await this.clearTokens(ctx);
                return null;
            }
            throw new AuthError(`Refresh failed: ${response.status} ${response.statusText}`, response.status, response);
        }

        const body = await response.json().catch(() => ({}));
        this.debugRefresh('refresh response body parsed', {
            parser: this.config.parseRefresh ? 'custom' : 'auto-detect',
            bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        });

        // Parse response
        let bundle: TokenBundle | null;
        try {
            bundle = this.config.parseRefresh
                ? this.config.parseRefresh(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            this.debugRefresh('refresh response parsing failed', {
                message: error.message,
                bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
            });
            throw new AuthError(`Invalid refresh response: ${error.message}`, response.status, response);
        }

        if (!bundle) {
            this.debugRefresh('refresh parser returned null/empty bundle, clearing stored tokens');
            await this.clearTokens(ctx);
            return null;
        }

        this.debugRefresh('refresh bundle parsed', this.describeBundle(bundle));

        // Validate bundle
        if (!bundle.accessToken || !bundle.refreshToken || !bundle.accessExpiresAt) {
            this.debugRefresh('refresh bundle validation failed', {
                hasAccessToken: !!bundle.accessToken,
                hasRefreshToken: !!bundle.refreshToken,
                hasAccessExpiresAt: !!bundle.accessExpiresAt,
            });
            throw new AuthError('Invalid token bundle returned from refresh endpoint', response.status, response);
        }

        // Store new tokens
        this.debugRefresh('storing refreshed tokens', {
            storage: this.getStorageType(),
            accessExpiresAt: bundle.accessExpiresAt,
            secondsUntilExpiry: bundle.accessExpiresAt - Math.floor(Date.now() / 1000),
        });
        await this.storeTokens(ctx, bundle);
        this.debugRefresh('refreshed tokens stored', {
            storage: this.getStorageType(),
        });

        return bundle;
    }

    /**
     * Ensure valid tokens (with automatic refresh)
     */
    async ensure(ctx: TokenKitContext, options?: AuthOptions, headers?: Record<string, string>, force: boolean = false): Promise<Session | null> {
        const now = Math.floor(Date.now() / 1000);
        const tokens = await this.retrieveTokens(ctx);
        const policy = normalizePolicy(this.config.policy);

        this.debugRefresh('ensure started', {
            force,
            now,
            storage: this.getStorageType(),
            policy,
            tokens: this.describeStoredTokens(tokens, now),
        });

        // Refresh-token-only records can happen after the browser drops short-lived
        // access-token cookies. They are still refreshable and should not be
        // treated as an invalid app session.
        if (!this.hasRequiredTokens(tokens)) {
            this.debugRefresh('stored token record is incomplete', {
                tokens: this.describeStoredTokens(tokens, now),
            });
            if (tokens.refreshToken) {
                this.debugRefresh('access token data missing, attempting refresh with refresh token');
                const bundle = await this.refresh(ctx, tokens.refreshToken, options, headers);

                if (!bundle) {
                    this.debugRefresh('refresh returned no bundle, session lost');
                    return null;
                }

                await this.storeTokens(ctx, bundle);
                this.debugRefresh('ensure returning refreshed session from incomplete token record', this.describeBundle(bundle));

                return {
                    accessToken: bundle.accessToken,
                    expiresAt: bundle.accessExpiresAt,
                    tokenType: bundle.tokenType,
                    payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
                };
            }

            if (this.isSessionStorage() && !this.hasAnyTokenData(tokens)) {
                this.debugRefresh('no TokenKit session found, skipping refresh');
                return null;
            }

            this.debugRefresh('no valid session found, refresh impossible');
            await this.clearTokens(ctx);
            if (this.config.onSessionInvalid) {
                this.debugRefresh('calling onSessionInvalid callback');
                await this.config.onSessionInvalid(new AuthError('No valid session found, refresh impossible', 401), ctx);
            }
            return null;
        }

        // Token expired or force refresh
        const expired = isExpired(tokens.expiresAt, now, this.config.policy);
        this.debugRefresh('token expiry evaluated', {
            force,
            expired,
            secondsUntilExpiry: tokens.expiresAt - now,
            adjustedSecondsUntilExpiry: tokens.expiresAt - (now + Number(policy.clockSkew)),
        });
        if (force || expired) {
            this.debugRefresh(force ? 'force refresh requested' : 'token expired, refreshing');
            const bundle = await this.refresh(ctx, tokens.refreshToken!, options, headers);

            if (!bundle) {
                this.debugRefresh('refresh returned no bundle, session lost');
                return null;
            }

            // Ensure tokens are stored in the current context (in case of shared flight)
            await this.storeTokens(ctx, bundle);
            this.debugRefresh('ensure returning refreshed session after expired/forced refresh', this.describeBundle(bundle));

            return {
                accessToken: bundle.accessToken,
                expiresAt: bundle.accessExpiresAt,
                tokenType: bundle.tokenType,
                payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
            };
        }

        // Proactive refresh
        const proactive = shouldRefresh(tokens.expiresAt, now, tokens.lastRefreshAt, this.config.policy);
        this.debugRefresh('proactive refresh evaluated', {
            proactive,
            secondsUntilExpiry: tokens.expiresAt - now,
            secondsSinceLastRefresh: tokens.lastRefreshAt === null ? null : now - tokens.lastRefreshAt,
            refreshBefore: policy.refreshBefore,
            minInterval: policy.minInterval,
        });
        if (proactive) {
            this.debugRefresh('token near expiration, performing proactive refresh');

            try {
                const bundle = await this.refresh(ctx, tokens.refreshToken!, options, headers);

                if (bundle) {
                    this.debugRefresh('proactive refresh successful', this.describeBundle(bundle));
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
                this.debugRefresh('proactive refresh failed, continuing with current token', {
                    message: (error as Error).message,
                });
            }

            // Refresh failed or returned no bundle, check if tokens still exist
            const currentTokens = await this.retrieveTokens(ctx);
            this.debugRefresh('tokens after failed proactive refresh', {
                tokens: this.describeStoredTokens(currentTokens, Math.floor(Date.now() / 1000)),
            });
            if (!this.hasRequiredTokens(currentTokens)) {
                this.debugRefresh('tokens missing after failed proactive refresh, clearing auth state');
                await this.clearTokens(ctx);
                return null;
            }
        }

        // Return current session
        this.debugRefresh('ensure returning existing session', {
            expiresAt: tokens.expiresAt,
            secondsUntilExpiry: tokens.expiresAt - now,
            tokenType: tokens.tokenType ?? undefined,
        });
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
                const session = await this.ensure(ctx);
                const resolvedHeaders = await this.resolveHeaders(ctx, 'logout');
                const headers: Record<string, string> = {
                    ...this.config.headers,
                    ...resolvedHeaders,
                };

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
        if (this.config.storage?.type === 'session') {
            throw new AuthError('getSession() cannot read async session storage. Use getSessionAsync() when auth.storage.type is "session".', 500);
        }

        const tokens = retrieveCookieTokens(ctx, this.config.cookies);
        const now = Math.floor(Date.now() / 1000);

        if (!this.hasRequiredTokens(tokens)) {
            this.debugAuth('getSession found incomplete token record, clearing auth state', {
                tokens: this.describeStoredTokens(tokens, now),
            });
            clearCookieTokens(ctx, this.config.cookies);
            return null;
        }

        const expired = isExpired(tokens.expiresAt, now, this.config.policy);
        if (expired) {
            const policy = normalizePolicy(this.config.policy);
            this.debugAuth('getSession found expired token, clearing auth state', {
                now,
                expiresAt: tokens.expiresAt,
                secondsUntilExpiry: tokens.expiresAt - now,
                clockSkew: policy.clockSkew,
                adjustedSecondsUntilExpiry: tokens.expiresAt - (now + Number(policy.clockSkew)),
            });
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
        const now = Math.floor(Date.now() / 1000);

        if (!this.hasRequiredTokens(tokens)) {
            if (this.isSessionStorage() && !this.hasAnyTokenData(tokens)) {
                this.debugAuth('getSessionAsync found no TokenKit session data');
                return null;
            }

            this.debugAuth('getSessionAsync found incomplete token record, clearing auth state', {
                tokens: this.describeStoredTokens(tokens, now),
            });
            await this.clearTokens(ctx);
            return null;
        }

        const expired = isExpired(tokens.expiresAt, now, this.config.policy);
        if (expired) {
            const policy = normalizePolicy(this.config.policy);
            this.debugAuth('getSessionAsync found expired token', {
                storage: this.getStorageType(),
                willClear: this.config.storage?.type !== 'session' || !tokens.refreshToken,
                now,
                expiresAt: tokens.expiresAt,
                secondsUntilExpiry: tokens.expiresAt - now,
                clockSkew: policy.clockSkew,
                adjustedSecondsUntilExpiry: tokens.expiresAt - (now + Number(policy.clockSkew)),
            });
            if (this.config.storage?.type !== 'session' || !tokens.refreshToken) {
                await this.clearTokens(ctx);
            }
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
    private createFlightKey(token: string, options?: AuthOptions, headers?: Record<string, string>): string {
        // Avoid weak hashing of sensitive tokens
        return `refresh_${token}_${this.stableStringify({
            headers,
            data: options?.data,
            params: options?.params,
        })}`;
    }

    private async resolveHeaders(ctx: TokenKitContext, operation: HeaderResolverOperation): Promise<Record<string, string>> {
        const headers = await this.config.resolveHeaders?.(ctx, { operation });
        return headers ?? {};
    }

    private stableStringify(value: unknown): string {
        if (value === undefined) return 'undefined';
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;

        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
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

    private isSessionStorage(): boolean {
        return this.config.storage?.type === 'session';
    }

    private getStorageType(): 'cookie' | 'session' {
        return this.config.storage?.type ?? 'cookie';
    }

    private debugRefresh(message: string, details?: Record<string, any>): void {
        if (details) {
            logger.debug(`[TokenKit][refresh] ${message}`, !!this.config.debug, details);
            return;
        }

        logger.debug(`[TokenKit][refresh] ${message}`, !!this.config.debug);
    }

    private debugAuth(message: string, details?: Record<string, any>): void {
        if (details) {
            logger.debug(`[TokenKit][auth] ${message}`, !!this.config.debug, details);
            return;
        }

        logger.debug(`[TokenKit][auth] ${message}`, !!this.config.debug);
    }

    private describeToken(token: string | null | undefined): Record<string, any> {
        return {
            present: !!token,
            length: token?.length ?? 0,
        };
    }

    private describeBundle(bundle: Partial<TokenBundle>): Record<string, any> {
        const now = Math.floor(Date.now() / 1000);
        return {
            accessToken: this.describeToken(bundle.accessToken),
            refreshToken: this.describeToken(bundle.refreshToken),
            accessExpiresAt: bundle.accessExpiresAt,
            secondsUntilExpiry: bundle.accessExpiresAt ? bundle.accessExpiresAt - now : null,
            refreshExpiresAt: bundle.refreshExpiresAt,
            secondsUntilRefreshExpiry: bundle.refreshExpiresAt ? bundle.refreshExpiresAt - now : null,
            tokenType: bundle.tokenType,
            hasSessionPayload: !!bundle.sessionPayload,
        };
    }

    private describeStoredTokens(tokens: {
        accessToken: string | null;
        refreshToken: string | null;
        expiresAt: number | null;
        lastRefreshAt?: number | null;
        tokenType?: string | null;
    }, now: number): Record<string, any> {
        return {
            accessToken: this.describeToken(tokens.accessToken),
            refreshToken: this.describeToken(tokens.refreshToken),
            expiresAt: tokens.expiresAt,
            secondsUntilExpiry: tokens.expiresAt === null ? null : tokens.expiresAt - now,
            lastRefreshAt: tokens.lastRefreshAt ?? null,
            secondsSinceLastRefresh: tokens.lastRefreshAt == null ? null : now - tokens.lastRefreshAt,
            tokenType: tokens.tokenType ?? null,
            hasRequiredTokens: !!(tokens.accessToken && tokens.refreshToken && tokens.expiresAt),
        };
    }

    private hasAnyTokenData(tokens: {
        accessToken: string | null;
        refreshToken: string | null;
        expiresAt: number | null;
        lastRefreshAt?: number | null;
        tokenType?: string | null;
    }): boolean {
        return !!(tokens.accessToken || tokens.refreshToken || tokens.expiresAt || tokens.lastRefreshAt || tokens.tokenType);
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

    private withQueryParams(url: string, ...paramsList: Array<Record<string, any> | undefined>): string {
        const mergedParams = Object.assign({}, ...paramsList.filter(Boolean));
        if (!Object.keys(mergedParams).length) return url;

        const urlObj = new URL(url);
        Object.entries(mergedParams).forEach(([key, value]) => {
            if (value === undefined || value === null) return;

            if (Array.isArray(value)) {
                urlObj.searchParams.delete(key);
                value.forEach(item => {
                    if (item !== undefined && item !== null) {
                        urlObj.searchParams.append(key, String(item));
                    }
                });
                return;
            }

            urlObj.searchParams.set(key, String(value));
        });

        return urlObj.toString();
    }

    private getMergedParamKeys(...paramsList: Array<Record<string, any> | undefined>): string[] {
        const keys = new Set<string>();
        paramsList.forEach((params) => {
            if (!params) return;
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    keys.add(key);
                }
            });
        });
        return Array.from(keys);
    }
}

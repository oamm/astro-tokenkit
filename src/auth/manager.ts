// packages/astro-tokenkit/src/auth/manager.ts

import { AuthError } from '../types';
import type { TokenBundle, Session, AuthConfig, TokenKitContext } from '../types';
import { autoDetectFields, parseJWTPayload } from './detector';
import { storeTokens, retrieveTokens, clearTokens } from './storage';
import { shouldRefresh, isExpired } from './policy';

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

        const promise = this.doExecute(key, fn);
        this.inFlight.set(key, promise);
        return promise;
    }

    private async doExecute(
        key: string,
        fn: () => Promise<TokenBundle | null>
    ): Promise<TokenBundle | null> {
        try {
            return await fn();
        } finally {
            this.inFlight.delete(key);
        }
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
    async login(ctx: TokenKitContext, credentials: any): Promise<TokenBundle> {
        const url = this.baseURL + this.config.login;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        }).catch(error => {
            throw new AuthError(`Login request failed: ${error.message}`);
        });

        if (!response.ok) {
            throw new AuthError(`Login failed: ${response.status} ${response.statusText}`, response.status, response);
        }

        const body = await response.json().catch(() => ({}));

        // Parse response
        let bundle: TokenBundle;
        try {
            bundle = this.config.parseLogin
                ? this.config.parseLogin(body)
                : autoDetectFields(body, this.config.fields);
        } catch (error: any) {
            throw new AuthError(`Invalid login response: ${error.message}`, response.status, response);
        }

        // Store in cookies
        storeTokens(ctx, bundle, this.config.cookies);

        // Call onLogin callback if provided
        if (this.config.onLogin) {
            await this.config.onLogin(bundle, body, ctx);
        }

        return bundle;
    }

    /**
     * Perform token refresh
     */
    async refresh(ctx: TokenKitContext, refreshToken: string): Promise<TokenBundle | null> {
        try {
            return await this.performRefresh(ctx, refreshToken);
        } catch (error) {
            clearTokens(ctx, this.config.cookies);
            throw error;
        }
    }

    /**
     * Internal refresh implementation
     */
    private async performRefresh(ctx: TokenKitContext, refreshToken: string): Promise<TokenBundle | null> {
        const url = this.baseURL + this.config.refresh;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        }).catch(error => {
            throw new AuthError(`Refresh request failed: ${error.message}`);
        });

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
    async ensure(ctx: TokenKitContext): Promise<Session | null> {
        const now = Math.floor(Date.now() / 1000);
        const tokens = retrieveTokens(ctx, this.config.cookies);

        // No tokens
        if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
            return null;
        }

        // Token expired
        if (isExpired(tokens.expiresAt, now, this.config.policy)) {
            const flightKey = this.createFlightKey(tokens.refreshToken);
            const bundle = await this.singleFlight.execute(flightKey, () =>
                this.refresh(ctx, tokens.refreshToken!)
            );

            if (!bundle) return null;

            return {
                accessToken: bundle.accessToken,
                expiresAt: bundle.accessExpiresAt,
                payload: bundle.sessionPayload ?? parseJWTPayload(bundle.accessToken) ?? undefined,
            };
        }

        // Proactive refresh
        if (shouldRefresh(tokens.expiresAt, now, tokens.lastRefreshAt, this.config.policy)) {
            const flightKey = this.createFlightKey(tokens.refreshToken);
            const bundle = await this.singleFlight.execute(flightKey, () =>
                this.refresh(ctx, tokens.refreshToken!)
            );

            if (bundle) {
                return {
                    accessToken: bundle.accessToken,
                    expiresAt: bundle.accessExpiresAt,
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
            payload: parseJWTPayload(tokens.accessToken) ?? undefined,
        };
    }

    /**
     * Logout (clear tokens)
     */
    async logout(ctx: TokenKitContext): Promise<void> {
        // Optionally call logout endpoint
        if (this.config.logout) {
            try {
                const url = this.baseURL + this.config.logout;
                await fetch(url, { method: 'POST' });
            } catch (error) {
                // Ignore logout endpoint errors
                console.warn('Logout endpoint failed:', error);
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
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            const char = token.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `flight_${Math.abs(hash).toString(36)}`;
    }
}
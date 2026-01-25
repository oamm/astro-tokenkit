// packages/astro-tokenkit/src/auth/manager.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { autoDetectFields, parseJWTPayload } from './detector';
import { storeTokens, retrieveTokens, clearTokens } from './storage';
import { shouldRefresh, isExpired } from './policy';
/**
 * Single-flight refresh manager
 */
class SingleFlight {
    constructor() {
        this.inFlight = new Map();
    }
    execute(key, fn) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = this.inFlight.get(key);
            if (existing)
                return existing;
            const promise = this.doExecute(key, fn);
            this.inFlight.set(key, promise);
            return promise;
        });
    }
    doExecute(key, fn) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield fn();
            }
            finally {
                this.inFlight.delete(key);
            }
        });
    }
}
/**
 * Token Manager handles all token operations
 */
export class TokenManager {
    constructor(config, baseURL) {
        this.config = config;
        this.singleFlight = new SingleFlight();
        this.baseURL = baseURL;
    }
    /**
     * Perform login
     */
    login(ctx, credentials) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = this.baseURL + this.config.login;
            const response = yield fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            });
            if (!response.ok) {
                throw new Error(`Login failed: ${response.status} ${response.statusText}`);
            }
            const body = yield response.json();
            // Parse response
            const bundle = this.config.parseLogin
                ? this.config.parseLogin(body)
                : autoDetectFields(body, this.config.fields);
            // Store in cookies
            storeTokens(ctx, bundle, this.config.cookies);
            return bundle;
        });
    }
    /**
     * Perform token refresh
     */
    refresh(ctx, refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = this.baseURL + this.config.refresh;
            try {
                const response = yield fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                });
                if (!response.ok) {
                    // 401/403 = invalid refresh token
                    if (response.status === 401 || response.status === 403) {
                        clearTokens(ctx, this.config.cookies);
                        return null;
                    }
                    throw new Error(`Refresh failed: ${response.status} ${response.statusText}`);
                }
                const body = yield response.json();
                // Parse response
                const bundle = this.config.parseRefresh
                    ? this.config.parseRefresh(body)
                    : autoDetectFields(body, this.config.fields);
                // Validate bundle
                if (!bundle.accessToken || !bundle.refreshToken || !bundle.accessExpiresAt) {
                    throw new Error('Invalid token bundle returned from refresh endpoint');
                }
                // Store new tokens
                storeTokens(ctx, bundle, this.config.cookies);
                return bundle;
            }
            catch (error) {
                clearTokens(ctx, this.config.cookies);
                throw error;
            }
        });
    }
    /**
     * Ensure valid tokens (with automatic refresh)
     */
    ensure(ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const now = Math.floor(Date.now() / 1000);
            const tokens = retrieveTokens(ctx, this.config.cookies);
            // No tokens
            if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
                return null;
            }
            // Token expired
            if (isExpired(tokens.expiresAt, now, this.config.policy)) {
                const flightKey = this.createFlightKey(tokens.refreshToken);
                const bundle = yield this.singleFlight.execute(flightKey, () => this.refresh(ctx, tokens.refreshToken));
                if (!bundle)
                    return null;
                return {
                    accessToken: bundle.accessToken,
                    expiresAt: bundle.accessExpiresAt,
                    payload: (_b = (_a = bundle.sessionPayload) !== null && _a !== void 0 ? _a : parseJWTPayload(bundle.accessToken)) !== null && _b !== void 0 ? _b : undefined,
                };
            }
            // Proactive refresh
            if (shouldRefresh(tokens.expiresAt, now, tokens.lastRefreshAt, this.config.policy)) {
                const flightKey = this.createFlightKey(tokens.refreshToken);
                const bundle = yield this.singleFlight.execute(flightKey, () => this.refresh(ctx, tokens.refreshToken));
                if (bundle) {
                    return {
                        accessToken: bundle.accessToken,
                        expiresAt: bundle.accessExpiresAt,
                        payload: (_d = (_c = bundle.sessionPayload) !== null && _c !== void 0 ? _c : parseJWTPayload(bundle.accessToken)) !== null && _d !== void 0 ? _d : undefined,
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
                payload: (_e = parseJWTPayload(tokens.accessToken)) !== null && _e !== void 0 ? _e : undefined,
            };
        });
    }
    /**
     * Logout (clear tokens)
     */
    logout(ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            // Optionally call logout endpoint
            if (this.config.logout) {
                try {
                    const url = this.baseURL + this.config.logout;
                    yield fetch(url, { method: 'POST' });
                }
                catch (error) {
                    // Ignore logout endpoint errors
                    console.warn('Logout endpoint failed:', error);
                }
            }
            clearTokens(ctx, this.config.cookies);
        });
    }
    /**
     * Get current session (no refresh)
     */
    getSession(ctx) {
        var _a;
        const tokens = retrieveTokens(ctx, this.config.cookies);
        if (!tokens.accessToken || !tokens.expiresAt) {
            return null;
        }
        return {
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
            payload: (_a = parseJWTPayload(tokens.accessToken)) !== null && _a !== void 0 ? _a : undefined,
        };
    }
    /**
     * Check if authenticated
     */
    isAuthenticated(ctx) {
        const tokens = retrieveTokens(ctx, this.config.cookies);
        return !!(tokens.accessToken && tokens.refreshToken);
    }
    /**
     * Create flight key for single-flight deduplication
     */
    createFlightKey(token) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            const char = token.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `flight_${Math.abs(hash).toString(36)}`;
    }
}

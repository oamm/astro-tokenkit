'use strict';

var node_async_hooks = require('node:async_hooks');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

// packages/astro-tokenkit/src/types.ts
/**
 * API Error
 */
class APIError extends Error {
    constructor(message, status, response, request) {
        super(message);
        this.status = status;
        this.response = response;
        this.request = request;
        this.name = 'APIError';
    }
}
/**
 * Authentication Error
 */
class AuthError extends APIError {
    constructor(message, status, response, request) {
        super(message, status, response, request);
        this.name = 'AuthError';
    }
}
/**
 * Network Error
 */
class NetworkError extends APIError {
    constructor(message, request) {
        super(message, undefined, undefined, request);
        this.name = 'NetworkError';
    }
}
/**
 * Timeout Error
 */
class TimeoutError extends APIError {
    constructor(message, request) {
        super(message, undefined, undefined, request);
        this.name = 'TimeoutError';
    }
}

// packages/astro-tokenkit/src/auth/detector.ts
/**
 * Common field names for access tokens
 */
const ACCESS_TOKEN_FIELDS = [
    'access_token',
    'accessToken',
    'token',
    'jwt',
    'id_token',
    'idToken',
];
/**
 * Common field names for refresh tokens
 */
const REFRESH_TOKEN_FIELDS = [
    'refresh_token',
    'refreshToken',
    'refresh',
];
/**
 * Common field names for expiration timestamp
 */
const EXPIRES_AT_FIELDS = [
    'expires_at',
    'expiresAt',
    'exp',
    'expiry',
];
/**
 * Common field names for expires_in (seconds)
 */
const EXPIRES_IN_FIELDS = [
    'expires_in',
    'expiresIn',
    'ttl',
];
/**
 * Common field names for session payload
 */
const SESSION_PAYLOAD_FIELDS = [
    'user',
    'profile',
    'account',
    'data',
];
/**
 * Auto-detect token fields from response body
 */
function autoDetectFields(body, fieldMapping) {
    // Helper to find field
    const findField = (candidates, mapping) => {
        if (mapping && body[mapping] !== undefined) {
            return body[mapping];
        }
        for (const candidate of candidates) {
            if (body[candidate] !== undefined) {
                return body[candidate];
            }
        }
        return undefined;
    };
    // Detect access token
    const accessToken = findField(ACCESS_TOKEN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.accessToken);
    if (!accessToken) {
        throw new Error(`Could not detect access token field. Tried: ${ACCESS_TOKEN_FIELDS.join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect refresh token
    const refreshToken = findField(REFRESH_TOKEN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.refreshToken);
    if (!refreshToken) {
        throw new Error(`Could not detect refresh token field. Tried: ${REFRESH_TOKEN_FIELDS.join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect expiration
    let accessExpiresAt;
    // Try expires_at first (timestamp)
    const expiresAtValue = findField(EXPIRES_AT_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.expiresAt);
    if (expiresAtValue !== undefined) {
        accessExpiresAt = typeof expiresAtValue === 'number'
            ? expiresAtValue
            : parseInt(expiresAtValue, 10);
    }
    // Try expires_in (seconds from now)
    if (accessExpiresAt === undefined) {
        const expiresInValue = findField(EXPIRES_IN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.expiresIn);
        if (expiresInValue !== undefined) {
            const expiresIn = typeof expiresInValue === 'number'
                ? expiresInValue
                : parseInt(expiresInValue, 10);
            accessExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        }
    }
    if (accessExpiresAt === undefined) {
        throw new Error(`Could not detect expiration field. Tried: ${[...EXPIRES_AT_FIELDS, ...EXPIRES_IN_FIELDS].join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect session payload (optional)
    const sessionPayload = findField(SESSION_PAYLOAD_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.sessionPayload);
    return {
        accessToken,
        refreshToken,
        accessExpiresAt,
        sessionPayload: sessionPayload || undefined,
    };
}
/**
 * Parse JWT payload without verification (for reading only)
 */
function parseJWTPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        const payload = parts[1];
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded);
    }
    catch (_a) {
        return null;
    }
}

// packages/astro-tokenkit/src/auth/storage.ts
/**
 * Get cookie names with optional prefix
 */
function getCookieNames(prefix) {
    const p = prefix ? `${prefix}_` : '';
    return {
        accessToken: `${p}access_token`,
        refreshToken: `${p}refresh_token`,
        expiresAt: `${p}access_expires_at`,
        lastRefreshAt: `${p}last_refresh_at`,
    };
}
/**
 * Get cookie options with smart defaults
 */
function getCookieOptions(config = {}) {
    var _a, _b;
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        secure: (_a = config.secure) !== null && _a !== void 0 ? _a : isProduction,
        sameSite: (_b = config.sameSite) !== null && _b !== void 0 ? _b : 'lax',
        httpOnly: true, // Always HttpOnly for security
        domain: config.domain,
    };
}
/**
 * Store token bundle in cookies
 */
function storeTokens(ctx, bundle, cookieConfig = {}) {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    const now = Math.floor(Date.now() / 1000);
    // Calculate max age
    const accessMaxAge = Math.max(0, bundle.accessExpiresAt - now);
    const refreshMaxAge = bundle.refreshExpiresAt
        ? Math.max(0, bundle.refreshExpiresAt - now)
        : 7 * 24 * 60 * 60; // Default 7 days
    // Set access token
    ctx.cookies.set(names.accessToken, bundle.accessToken, Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
    // Set refresh token (restricted path for security)
    ctx.cookies.set(names.refreshToken, bundle.refreshToken, Object.assign(Object.assign({}, options), { maxAge: refreshMaxAge, path: '/' }));
    // Set expiration timestamp
    ctx.cookies.set(names.expiresAt, bundle.accessExpiresAt.toString(), Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
    // Set last refresh timestamp
    ctx.cookies.set(names.lastRefreshAt, now.toString(), Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
}
/**
 * Retrieve tokens from cookies
 */
function retrieveTokens(ctx, cookieConfig = {}) {
    var _a, _b, _c, _d;
    const names = getCookieNames(cookieConfig.prefix);
    const accessToken = ((_a = ctx.cookies.get(names.accessToken)) === null || _a === void 0 ? void 0 : _a.value) || null;
    const refreshToken = ((_b = ctx.cookies.get(names.refreshToken)) === null || _b === void 0 ? void 0 : _b.value) || null;
    const expiresAtStr = (_c = ctx.cookies.get(names.expiresAt)) === null || _c === void 0 ? void 0 : _c.value;
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;
    const lastRefreshAtStr = (_d = ctx.cookies.get(names.lastRefreshAt)) === null || _d === void 0 ? void 0 : _d.value;
    const lastRefreshAt = lastRefreshAtStr ? parseInt(lastRefreshAtStr, 10) : null;
    return { accessToken, refreshToken, expiresAt, lastRefreshAt };
}
/**
 * Clear all auth cookies
 */
function clearTokens(ctx, cookieConfig = {}) {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    ctx.cookies.delete(names.accessToken, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.refreshToken, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.expiresAt, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.lastRefreshAt, Object.assign(Object.assign({}, options), { path: '/' }));
}

// packages/astro-tokenkit/src/utils/time.ts
/**
 * Parse time string to seconds
 * Supports: '5m', '30s', '1h', '2d'
 */
function parseTime(input) {
    if (typeof input === 'number') {
        return input;
    }
    const match = input.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error(`Invalid time format: ${input}. Use format like '5m', '30s', '1h', '2d'`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = {
        s: 1,
        m: 60,
        h: 60 * 60,
        d: 60 * 60 * 24,
    };
    return value * multipliers[unit];
}
/**
 * Format seconds to human-readable string
 */
function formatTime(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

// packages/astro-tokenkit/src/auth/policy.ts
/**
 * Default refresh policy
 */
const DEFAULT_POLICY = {
    refreshBefore: 300, // 5 minutes
    clockSkew: 60, // 1 minute
    minInterval: 30, // 30 seconds
};
/**
 * Normalize refresh policy (convert time strings to seconds)
 */
function normalizePolicy(policy = {}) {
    return {
        refreshBefore: policy.refreshBefore
            ? parseTime(policy.refreshBefore)
            : DEFAULT_POLICY.refreshBefore,
        clockSkew: policy.clockSkew
            ? parseTime(policy.clockSkew)
            : DEFAULT_POLICY.clockSkew,
        minInterval: policy.minInterval
            ? parseTime(policy.minInterval)
            : DEFAULT_POLICY.minInterval,
    };
}
/**
 * Check if token should be refreshed
 */
function shouldRefresh(expiresAt, now, lastRefreshAt, policy = {}) {
    const normalized = normalizePolicy(policy);
    const refreshBefore = typeof normalized.refreshBefore === 'number'
        ? normalized.refreshBefore
        : parseTime(normalized.refreshBefore);
    const clockSkew = typeof normalized.clockSkew === 'number'
        ? normalized.clockSkew
        : parseTime(normalized.clockSkew);
    const minInterval = typeof normalized.minInterval === 'number'
        ? normalized.minInterval
        : parseTime(normalized.minInterval);
    // Adjust for clock skew
    const adjustedNow = now + clockSkew;
    // Check if near expiration
    const timeUntilExpiry = expiresAt - adjustedNow;
    if (timeUntilExpiry > refreshBefore) {
        return false;
    }
    // Check minimum interval
    if (lastRefreshAt !== null) {
        const timeSinceLastRefresh = now - lastRefreshAt;
        if (timeSinceLastRefresh < minInterval) {
            return false;
        }
    }
    return true;
}
/**
 * Check if token is expired
 */
function isExpired(expiresAt, now, policy = {}) {
    const normalized = normalizePolicy(policy);
    const clockSkew = typeof normalized.clockSkew === 'number'
        ? normalized.clockSkew
        : parseTime(normalized.clockSkew);
    return now > expiresAt + clockSkew;
}

// packages/astro-tokenkit/src/auth/manager.ts
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
class TokenManager {
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

// packages/astro-tokenkit/src/client/context.ts
/**
 * Async local storage for Astro context
 */
const defaultContextStorage = new node_async_hooks.AsyncLocalStorage();
/**
 * Bind Astro context for the current async scope
 */
function bindContext(ctx, fn, options) {
    const storage = (options === null || options === void 0 ? void 0 : options.context) || defaultContextStorage;
    return storage.run(ctx, fn);
}
/**
 * Get current Astro context (from middleware binding or explicit)
 */
function getContext(explicitCtx, options) {
    const store = (options === null || options === void 0 ? void 0 : options.getContextStore)
        ? options.getContextStore()
        : ((options === null || options === void 0 ? void 0 : options.context) || defaultContextStorage).getStore();
    const ctx = explicitCtx || store;
    if (!ctx) {
        throw new Error('Astro context not found. Either:\n' +
            '1. Use api.middleware() to bind context automatically, or\n' +
            '2. Pass context explicitly: api.get("/path", { ctx: Astro })');
    }
    return ctx;
}

// packages/astro-tokenkit/src/utils/retry.ts
/**
 * Default retry configuration
 */
const DEFAULT_RETRY = {
    attempts: 3,
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoff: 'exponential',
    delay: 1000,
};
/**
 * Calculate retry delay
 */
function calculateDelay(attempt, config = {}) {
    const { backoff = DEFAULT_RETRY.backoff, delay = DEFAULT_RETRY.delay } = config;
    if (backoff === 'linear') {
        return delay * attempt;
    }
    // Exponential backoff: delay * 2^(attempt-1)
    return delay * Math.pow(2, attempt - 1);
}
/**
 * Check if error should be retried
 */
function shouldRetry(status, attempt, config = {}) {
    const { attempts = DEFAULT_RETRY.attempts, statusCodes = DEFAULT_RETRY.statusCodes, } = config;
    if (attempt >= attempts) {
        return false;
    }
    if (status === undefined) {
        // Network errors are retryable
        return true;
    }
    return statusCodes.includes(status);
}
/**
 * Sleep for given milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// packages/astro-tokenkit/src/client/client.ts
/**
 * API Client
 */
class APIClient {
    constructor(config) {
        this.config = config;
        this.contextOptions = {
            context: config.context,
            getContextStore: config.getContextStore,
        };
        // Initialize token manager if auth is configured
        if (config.auth) {
            this.tokenManager = new TokenManager(config.auth, config.baseURL);
        }
    }
    /**
     * GET request
     */
    get(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(Object.assign({ method: 'GET', url }, options));
        });
    }
    /**
     * POST request
     */
    post(url, data, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(Object.assign({ method: 'POST', url,
                data }, options));
        });
    }
    /**
     * PUT request
     */
    put(url, data, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(Object.assign({ method: 'PUT', url,
                data }, options));
        });
    }
    /**
     * PATCH request
     */
    patch(url, data, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(Object.assign({ method: 'PATCH', url,
                data }, options));
        });
    }
    /**
     * DELETE request
     */
    delete(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(Object.assign({ method: 'DELETE', url }, options));
        });
    }
    /**
     * Generic request method
     */
    request(config) {
        return __awaiter(this, void 0, void 0, function* () {
            const ctx = getContext(config.ctx, this.contextOptions);
            let attempt = 0;
            while (true) {
                attempt++;
                try {
                    const response = yield this.executeRequest(config, ctx, attempt);
                    return response.data;
                }
                catch (error) {
                    // Check if we should retry
                    const status = error.status;
                    if (shouldRetry(status, attempt, this.config.retry)) {
                        const delay = calculateDelay(attempt, this.config.retry);
                        yield sleep(delay);
                        continue;
                    }
                    // No more retries
                    throw error;
                }
            }
        });
    }
    /**
     * Execute single request
     */
    executeRequest(config, ctx, attempt) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            // Ensure valid session (if auth is enabled)
            if (this.tokenManager && !config.skipAuth) {
                yield this.tokenManager.ensure(ctx);
            }
            // Build full URL
            const fullURL = this.buildURL(config.url, config.params);
            // Build headers
            const headers = this.buildHeaders(config, ctx);
            // Build request init
            const init = {
                method: config.method,
                headers,
                signal: config.signal,
            };
            // Add body for non-GET requests
            if (config.data && config.method !== 'GET') {
                init.body = JSON.stringify(config.data);
            }
            // Apply request interceptors
            let requestConfig = Object.assign({}, config);
            if ((_a = this.config.interceptors) === null || _a === void 0 ? void 0 : _a.request) {
                for (const interceptor of this.config.interceptors.request) {
                    requestConfig = yield interceptor(requestConfig, ctx);
                }
            }
            // Execute fetch with timeout
            const timeout = (_c = (_b = config.timeout) !== null && _b !== void 0 ? _b : this.config.timeout) !== null && _c !== void 0 ? _c : 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = yield fetch(fullURL, Object.assign(Object.assign({}, init), { signal: controller.signal }));
                clearTimeout(timeoutId);
                // Handle 401 (try refresh and retry once)
                if (response.status === 401 && this.tokenManager && !config.skipAuth && attempt === 1) {
                    // Clear and try fresh session
                    const session = yield this.tokenManager.ensure(ctx);
                    if (session) {
                        // Retry with new token
                        return this.executeRequest(config, ctx, attempt + 1);
                    }
                }
                // Parse response
                const apiResponse = yield this.parseResponse(response, fullURL);
                // Apply response interceptors
                if ((_d = this.config.interceptors) === null || _d === void 0 ? void 0 : _d.response) {
                    let interceptedResponse = apiResponse;
                    for (const interceptor of this.config.interceptors.response) {
                        interceptedResponse = yield interceptor(interceptedResponse, ctx);
                    }
                    return interceptedResponse;
                }
                return apiResponse;
            }
            catch (error) {
                clearTimeout(timeoutId);
                // Apply error interceptors
                if ((_e = this.config.interceptors) === null || _e === void 0 ? void 0 : _e.error) {
                    for (const interceptor of this.config.interceptors.error) {
                        yield interceptor(error, ctx);
                    }
                }
                // Transform errors
                if (error instanceof Error && error.name === 'AbortError') {
                    throw new TimeoutError(`Request timeout after ${timeout}ms`, requestConfig);
                }
                if (error instanceof APIError) {
                    throw error;
                }
                throw new NetworkError(error.message, requestConfig);
            }
        });
    }
    /**
     * Parse response
     */
    parseResponse(response, url) {
        return __awaiter(this, void 0, void 0, function* () {
            let data;
            // Try to parse JSON
            const contentType = response.headers.get('content-type');
            if (contentType === null || contentType === void 0 ? void 0 : contentType.includes('application/json')) {
                try {
                    data = yield response.json();
                }
                catch (_a) {
                    data = (yield response.text());
                }
            }
            else {
                data = (yield response.text());
            }
            // Check if response is ok
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new AuthError(`Authentication failed: ${response.status} ${response.statusText}`, response.status, data);
                }
                throw new APIError(`Request failed: ${response.status} ${response.statusText}`, response.status, data);
            }
            return {
                data,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                url,
            };
        });
    }
    /**
     * Build full URL with query params
     */
    buildURL(url, params) {
        const fullURL = url.startsWith('http') ? url : this.config.baseURL + url;
        if (!params)
            return fullURL;
        const urlObj = new URL(fullURL);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlObj.searchParams.append(key, String(value));
            }
        });
        return urlObj.toString();
    }
    /**
     * Build request headers
     */
    buildHeaders(config, ctx) {
        var _a, _b;
        const headers = Object.assign(Object.assign({ 'Content-Type': 'application/json' }, this.config.headers), config.headers);
        // Add auth token if available
        if (this.tokenManager && !config.skipAuth) {
            const session = this.tokenManager.getSession(ctx);
            if (session === null || session === void 0 ? void 0 : session.accessToken) {
                const injectFn = (_b = (_a = this.config.auth) === null || _a === void 0 ? void 0 : _a.injectToken) !== null && _b !== void 0 ? _b : ((token) => `Bearer ${token}`);
                headers['Authorization'] = injectFn(session.accessToken);
            }
        }
        return headers;
    }
    /**
     * Login
     */
    login(credentials, ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.tokenManager) {
                throw new Error('Auth is not configured for this client');
            }
            const context = getContext(ctx, this.contextOptions);
            yield this.tokenManager.login(context, credentials);
        });
    }
    /**
     * Logout
     */
    logout(ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.tokenManager) {
                throw new Error('Auth is not configured for this client');
            }
            const context = getContext(ctx, this.contextOptions);
            yield this.tokenManager.logout(context);
        });
    }
    /**
     * Check if authenticated
     */
    isAuthenticated(ctx) {
        if (!this.tokenManager)
            return false;
        const context = getContext(ctx, this.contextOptions);
        return this.tokenManager.isAuthenticated(context);
    }
    /**
     * Get current session
     */
    getSession(ctx) {
        if (!this.tokenManager)
            return null;
        const context = getContext(ctx, this.contextOptions);
        return this.tokenManager.getSession(context);
    }
}
/**
 * Create API client
 */
function createClient(config) {
    return new APIClient(config);
}

// packages/astro-tokenkit/src/middleware.ts
/**
 * Create middleware for context binding and automatic token rotation
 */
function createMiddleware(client) {
    return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
        const tokenManager = client.tokenManager;
        const contextOptions = client.contextOptions;
        const runLogic = () => __awaiter(this, void 0, void 0, function* () {
            // Proactively ensure valid session if auth is configured
            if (tokenManager) {
                try {
                    // This handles token rotation (refresh) if needed
                    yield tokenManager.ensure(ctx);
                }
                catch (error) {
                    // Log but don't block request if rotation fails
                    console.error('[TokenKit] Automatic token rotation failed:', error);
                }
            }
            return next();
        });
        // If getContextStore is defined, it means the context is managed externally (e.g., by a superior ALS)
        // We skip bindContext to avoid nesting ALS.run() unnecessarily.
        if (contextOptions === null || contextOptions === void 0 ? void 0 : contextOptions.getContextStore) {
            return runLogic();
        }
        return bindContext(ctx, runLogic, contextOptions);
    });
}

// packages/astro-tokenkit/src/integration.ts
/**
 * Astro integration for TokenKit
 *
 * This integration facilitates the setup of TokenKit in an Astro project.
 */
function tokenKit(client) {
    return {
        name: 'astro-tokenkit',
        hooks: {
            'astro:config:setup': () => {
                // Future-proofing: could add vite aliases or other setup here
                console.log('[TokenKit] Integration initialized');
            },
        },
    };
}
/**
 * Helper to define middleware in a separate file if needed
 */
const defineMiddleware = (client) => createMiddleware(client);

exports.APIClient = APIClient;
exports.APIError = APIError;
exports.AuthError = AuthError;
exports.NetworkError = NetworkError;
exports.TimeoutError = TimeoutError;
exports.createClient = createClient;
exports.createMiddleware = createMiddleware;
exports.defineMiddleware = defineMiddleware;
exports.formatTime = formatTime;
exports.parseTime = parseTime;
exports.tokenKit = tokenKit;
//# sourceMappingURL=index.cjs.map

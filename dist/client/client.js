// packages/astro-tokenkit/src/client/client.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { APIError, AuthError, NetworkError, TimeoutError } from '../types';
import { TokenManager } from '../auth/manager';
import { getContext } from './context';
import { calculateDelay, shouldRetry, sleep } from '../utils/retry';
/**
 * API Client
 */
export class APIClient {
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
            let lastError;
            while (true) {
                attempt++;
                try {
                    const response = yield this.executeRequest(config, ctx, attempt);
                    return response.data;
                }
                catch (error) {
                    lastError = error;
                    // Check if we should retry
                    if (shouldRetry(error.status, attempt, this.config.retry)) {
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
export function createClient(config) {
    return new APIClient(config);
}

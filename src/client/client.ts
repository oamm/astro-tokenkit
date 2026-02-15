// packages/astro-tokenkit/src/client/client.ts

import type {
    APIResponse,
    AuthConfig,
    ClientConfig,
    LoginOptions,
    RequestConfig,
    RequestOptions,
    Session,
    TokenBundle,
    TokenKitConfig,
    TokenKitContext
} from '../types';
import {APIError, AuthError, NetworkError, TimeoutError} from '../types';
import {TokenManager} from '../auth/manager';
import {getContextStore} from './context';
import {calculateDelay, shouldRetry, sleep} from '../utils/retry';
import {getConfig, getTokenManager} from '../config';
import {createMiddleware} from '../middleware';
import {safeFetch} from '../utils/fetch';

/**
 * API Client
 */
export class APIClient {
    private customConfig?: Partial<TokenKitConfig>;
    private _localTokenManager?: TokenManager;
    private _lastUsedAuth?: AuthConfig;
    private _lastUsedBaseURL?: string;

    constructor(config?: Partial<TokenKitConfig>) {
        this.customConfig = config;
    }

    /**
     * Get current configuration (merged with global)
     */
    public get config(): ClientConfig {
        // Merge global config with custom config
        const globalConfig = getConfig();
        
        // If no custom config, return global config directly
        if (!this.customConfig) return globalConfig as ClientConfig;
        
        // Merge custom config on top of global config
        return {
            ...globalConfig,
            ...this.customConfig,
        } as ClientConfig;
    }

    /**
     * Get token manager
     */
    public get tokenManager(): TokenManager | undefined {
        const config = this.config;
        if (!config.auth) return undefined;

        const globalConfig = getConfig();
        const globalManager = getTokenManager();

        // Reuse global manager if it matches our configuration
        if (globalManager && 
            config.auth === globalConfig.auth && 
            config.baseURL === globalConfig.baseURL) {
            return globalManager;
        }

        // Otherwise create/reuse a local manager for this client
        if (!this._localTokenManager || 
            this._lastUsedAuth !== config.auth || 
            this._lastUsedBaseURL !== config.baseURL) {
            
            // Merge client-level fetch and SSL settings into auth config
            const authConfig: AuthConfig = {
                ...config.auth,
                fetch: config.auth.fetch ?? config.fetch,
                dangerouslyIgnoreCertificateErrors: config.auth.dangerouslyIgnoreCertificateErrors ?? config.dangerouslyIgnoreCertificateErrors,
            };
            
            this._localTokenManager = new TokenManager(authConfig, config.baseURL);
            this._lastUsedAuth = config.auth;
            this._lastUsedBaseURL = config.baseURL;
        }

        return this._localTokenManager;
    }

    /**
     * Get middleware for context binding and automatic token rotation.
     * This middleware uses the global configuration.
     */
    public middleware() {
        return createMiddleware();
    }

    /**
     * GET request
     */
    async get<T = any>(url: string, options?: RequestOptions): Promise<APIResponse<T>> {
        return this.request<T>({
            method: 'GET',
            url,
            ...options,
        });
    }

    /**
     * POST request
     */
    async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<APIResponse<T>> {
        return this.request<T>({
            method: 'POST',
            url,
            data,
            ...options,
        });
    }

    /**
     * PUT request
     */
    async put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<APIResponse<T>> {
        return this.request<T>({
            method: 'PUT',
            url,
            data,
            ...options,
        });
    }

    /**
     * PATCH request
     */
    async patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<APIResponse<T>> {
        return this.request<T>({
            method: 'PATCH',
            url,
            data,
            ...options,
        });
    }

    /**
     * DELETE request
     */
    async delete<T = any>(url: string, options?: RequestOptions): Promise<APIResponse<T>> {
        return this.request<T>({
            method: 'DELETE',
            url,
            ...options,
        });
    }

    /**
     * Generic request method
     */
    async request<T = any>(config: RequestConfig): Promise<APIResponse<T>> {
        const ctx = getContextStore();
        let attempt = 0;

        while (true) {
            attempt++;

            try {
                return await this.executeRequest<T>(config, ctx, attempt);
            } catch (error) {
                // Check if we should retry
                if (shouldRetry((error as APIError).status, attempt, this.config.retry)) {
                    const delay = calculateDelay(attempt, this.config.retry);
                    await sleep(delay);
                    continue;
                }

                // No more retries
                throw error;
            }
        }
    }

    /**
     * Execute single request
     */
    private async executeRequest<T>(
        config: RequestConfig,
        ctx: TokenKitContext,
        attempt: number
    ): Promise<APIResponse<T>> {
        // Ensure valid session (if auth is enabled)
        if (this.tokenManager && !config.skipAuth) {
            await this.tokenManager.ensure(ctx, config.auth, config.headers);
        }

        // Build full URL
        const fullURL = this.buildURL(config.url, config.params);

        // Build headers
        const headers = this.buildHeaders(config, ctx, fullURL);

        // Build request init
        const init: RequestInit = {
            method: config.method,
            headers,
            signal: config.signal,
        };

        // Add body for non-GET requests
        if (config.data && config.method !== 'GET') {
            init.body = JSON.stringify(config.data);
        }

        // Apply request interceptors
        let requestConfig = { ...config };
        if (this.config.interceptors?.request) {
            for (const interceptor of this.config.interceptors.request) {
                requestConfig = await interceptor(requestConfig, ctx);
            }
        }

        // Execute fetch with timeout
        const timeout = config.timeout ?? this.config.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await safeFetch(fullURL, {
                ...init,
                signal: controller.signal,
            }, this.config);

            clearTimeout(timeoutId);

            // Handle 401 (try refresh and retry once)
            if (response.status === 401 && this.tokenManager && !config.skipAuth && attempt === 1) {
                // Clear and try fresh session (force refresh)
                const session = await this.tokenManager.ensure(ctx, config.auth, config.headers, true);
                if (session) {
                    // Retry with new token
                    return this.executeRequest<T>(config, ctx, attempt + 1);
                }
            }

            // Parse response
            const apiResponse = await this.parseResponse<T>(response, fullURL);

            // Apply response interceptors
            if (this.config.interceptors?.response) {
                let interceptedResponse = apiResponse;
                for (const interceptor of this.config.interceptors.response) {
                    interceptedResponse = await interceptor(interceptedResponse, ctx);
                }
                return interceptedResponse;
            }

            return apiResponse;
        } catch (error) {
            clearTimeout(timeoutId);

            // Apply error interceptors
            if (this.config.interceptors?.error) {
                for (const interceptor of this.config.interceptors.error) {
                    await interceptor(error as APIError, ctx);
                }
            }

            // Transform errors
            if (error instanceof Error && error.name === 'AbortError') {
                throw new TimeoutError(`Request timeout after ${timeout}ms`, requestConfig, error);
            }

            if (error instanceof APIError) {
                throw error;
            }

            throw new NetworkError((error as Error).message, requestConfig, error);
        }
    }

    /**
     * Parse response
     */
    private async parseResponse<T>(response: Response, url: string): Promise<APIResponse<T>> {
        let data: T;

        // Try to parse JSON
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            try {
                data = await response.json();
            } catch {
                data = await response.text() as any;
            }
        } else {
            data = await response.text() as any;
        }

        // Check if response is ok
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new AuthError(
                    `Authentication failed: ${response.status} ${response.statusText}`,
                    response.status,
                    data
                );
            }

            throw new APIError(
                `Request failed: ${response.status} ${response.statusText}`,
                response.status,
                data
            );
        }

        return {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            url,
            ok: response.ok,
        };
    }

    /**
     * Build full URL with query params
     */
    private buildURL(url: string, params?: Record<string, any>): string {
        const fullURL = url.startsWith('http') ? url : this.config.baseURL + url;

        if (!params) return fullURL;

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
    private buildHeaders(config: RequestConfig, ctx: TokenKitContext, targetURL: string): HeadersInit {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...config.headers,
        };

        // Add auth token if available (only for safe URLs)
        if (this.tokenManager && !config.skipAuth && this.isSafeURL(targetURL)) {
            const session = this.tokenManager.getSession(ctx);
            if (session?.accessToken) {
                const injectFn = this.config.auth?.injectToken ?? ((token, type) => `${type ?? 'Bearer'} ${token}`);
                headers['Authorization'] = injectFn(session.accessToken, session.tokenType);
            }
        }

        return headers;
    }

    /**
     * Check if a URL is safe for token injection (same origin as baseURL)
     */
    private isSafeURL(url: string): boolean {
        try {
            const requestUrl = new URL(url, this.config.baseURL);
            const baseUrl = new URL(this.config.baseURL || 'http://localhost');
            return requestUrl.origin === baseUrl.origin;
        } catch {
            // Only allow relative paths if baseURL is missing or invalid
            return !url.startsWith('http') && !url.startsWith('//');
        }
    }

    /**
     * Login
     */
    async login(credentials: any, options?: LoginOptions): Promise<APIResponse<TokenBundle>> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContextStore();
        return await this.tokenManager.login(context, credentials, options);
    }

    /**
     * Logout
     */
    async logout(): Promise<void> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContextStore();
        await this.tokenManager.logout(context);
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(): boolean {
        if (!this.tokenManager) return false;

        const context = getContextStore();
        return this.tokenManager.isAuthenticated(context);
    }

    /**
     * Get current session
     */
    getSession(): Session | null {
        if (!this.tokenManager) return null;

        const context = getContextStore();
        return this.tokenManager.getSession(context);
    }

}

/**
 * Global API client instance.
 * 
 * This client is automatically synchronized with the global configuration 
 * set via the Astro integration or setConfig().
 */
export const api = new APIClient();

/**
 * Create API client.
 * 
 * If no configuration is provided, it returns the global `api` singleton.
 */
export function createClient(config?: Partial<TokenKitConfig>): APIClient {
    if (!config) return api;
    return new APIClient(config);
}
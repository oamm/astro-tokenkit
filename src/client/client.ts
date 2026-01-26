// packages/astro-tokenkit/src/client/client.ts

import type {APIResponse, ClientConfig, RequestConfig, RequestOptions, Session, TokenKitContext, TokenKitConfig, AuthConfig} from '../types';
import {APIError, AuthError, NetworkError, TimeoutError} from '../types';
import {TokenManager} from '../auth/manager';
import {getContextStore} from './context';
import {calculateDelay, shouldRetry, sleep} from '../utils/retry';
import {getConfig, getTokenManager} from '../config';
import {createMiddleware} from '../middleware';

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
            this._localTokenManager = new TokenManager(config.auth, config.baseURL);
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
    async get<T = any>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>({
            method: 'GET',
            url,
            ...options,
        });
    }

    /**
     * POST request
     */
    async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T> {
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
    async put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T> {
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
    async patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T> {
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
    async delete<T = any>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>({
            method: 'DELETE',
            url,
            ...options,
        });
    }

    /**
     * Generic request method
     */
    async request<T = any>(config: RequestConfig): Promise<T> {
        const ctx = getContextStore(config.ctx);
        let attempt = 0;
        let lastError: Error | undefined;

        while (true) {
            attempt++;

            try {
                const response = await this.executeRequest<T>(config, ctx, attempt);
                return response.data;
            } catch (error) {
                lastError = error as Error;

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
            await this.tokenManager.ensure(ctx);
        }

        // Build full URL
        const fullURL = this.buildURL(config.url, config.params);

        // Build headers
        const headers = this.buildHeaders(config, ctx);

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
            const response = await fetch(fullURL, {
                ...init,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Handle 401 (try refresh and retry once)
            if (response.status === 401 && this.tokenManager && !config.skipAuth && attempt === 1) {
                // Clear and try fresh session
                const session = await this.tokenManager.ensure(ctx);
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
                throw new TimeoutError(`Request timeout after ${timeout}ms`, requestConfig);
            }

            if (error instanceof APIError) {
                throw error;
            }

            throw new NetworkError((error as Error).message, requestConfig);
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
    private buildHeaders(config: RequestConfig, ctx: TokenKitContext): HeadersInit {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...config.headers,
        };

        // Add auth token if available
        if (this.tokenManager && !config.skipAuth) {
            const session = this.tokenManager.getSession(ctx);
            if (session?.accessToken) {
                const injectFn = this.config.auth?.injectToken ?? ((token) => `Bearer ${token}`);
                headers['Authorization'] = injectFn(session.accessToken);
            }
        }

        return headers;
    }

    /**
     * Login
     */
    async login(credentials: any, ctx?: TokenKitContext): Promise<void> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContextStore(ctx);
        await this.tokenManager.login(context, credentials);
    }

    /**
     * Logout
     */
    async logout(ctx?: TokenKitContext): Promise<void> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContextStore(ctx);
        await this.tokenManager.logout(context);
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(ctx?: TokenKitContext): boolean {
        if (!this.tokenManager) return false;

        const context = getContextStore(ctx);
        return this.tokenManager.isAuthenticated(context);
    }

    /**
     * Get current session
     */
    getSession(ctx?: TokenKitContext): Session | null {
        if (!this.tokenManager) return null;

        const context = getContextStore(ctx);
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
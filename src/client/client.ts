// packages/astro-tokenkit/src/client/client.ts

import type { AstroGlobal, MiddlewareHandler } from 'astro';

import type {
    ClientConfig,
    RequestOptions,
    RequestConfig,
    APIResponse,
    Session,
} from '../types';
import { APIError, AuthError, NetworkError, TimeoutError } from '../types';
import { TokenManager } from '../auth/manager';
import { getContext, bindContext } from './context';
import { shouldRetry, calculateDelay, sleep } from '../utils/retry';

/**
 * API Client
 */
export class APIClient {
    private tokenManager?: TokenManager;
    private config: ClientConfig;

    constructor(config: ClientConfig) {
        this.config = config;

        // Initialize token manager if auth is configured
        if (config.auth) {
            this.tokenManager = new TokenManager(config.auth, config.baseURL);
        }
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
        const ctx = getContext(config.ctx);
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
                const status = (error as APIError).status;
                if (shouldRetry(status, attempt, this.config.retry)) {
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
        ctx: AstroGlobal,
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
    private buildHeaders(config: RequestConfig, ctx: AstroGlobal): HeadersInit {
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
    async login(credentials: any, ctx?: AstroGlobal): Promise<void> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContext(ctx);
        await this.tokenManager.login(context, credentials);
    }

    /**
     * Logout
     */
    async logout(ctx?: AstroGlobal): Promise<void> {
        if (!this.tokenManager) {
            throw new Error('Auth is not configured for this client');
        }

        const context = getContext(ctx);
        await this.tokenManager.logout(context);
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(ctx?: AstroGlobal): boolean {
        if (!this.tokenManager) return false;

        const context = getContext(ctx);
        return this.tokenManager.isAuthenticated(context);
    }

    /**
     * Get current session
     */
    getSession(ctx?: AstroGlobal): Session | null {
        if (!this.tokenManager) return null;

        const context = getContext(ctx);
        return this.tokenManager.getSession(context);
    }

    /**
     * Create middleware for context binding
     */
    middleware(): MiddlewareHandler {
        return async (ctx, next) => {
            return bindContext(ctx, () => next());
        };
    }
}

/**
 * Create API client
 */
export function createClient(config: ClientConfig): APIClient {
    return new APIClient(config);
}
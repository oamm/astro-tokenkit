import type { ClientConfig, RequestOptions, RequestConfig, Session, TokenKitContext } from '../types';
import { TokenManager } from '../auth/manager';
import { type ContextOptions } from './context';
/**
 * API Client
 */
export declare class APIClient {
    tokenManager?: TokenManager;
    private config;
    contextOptions: ContextOptions;
    constructor(config: ClientConfig);
    /**
     * GET request
     */
    get<T = any>(url: string, options?: RequestOptions): Promise<T>;
    /**
     * POST request
     */
    post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    /**
     * PUT request
     */
    put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    /**
     * PATCH request
     */
    patch<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
    /**
     * DELETE request
     */
    delete<T = any>(url: string, options?: RequestOptions): Promise<T>;
    /**
     * Generic request method
     */
    request<T = any>(config: RequestConfig): Promise<T>;
    /**
     * Execute single request
     */
    private executeRequest;
    /**
     * Parse response
     */
    private parseResponse;
    /**
     * Build full URL with query params
     */
    private buildURL;
    /**
     * Build request headers
     */
    private buildHeaders;
    /**
     * Login
     */
    login(credentials: any, ctx?: TokenKitContext): Promise<void>;
    /**
     * Logout
     */
    logout(ctx?: TokenKitContext): Promise<void>;
    /**
     * Check if authenticated
     */
    isAuthenticated(ctx?: TokenKitContext): boolean;
    /**
     * Get current session
     */
    getSession(ctx?: TokenKitContext): Session | null;
}
/**
 * Create API client
 */
export declare function createClient(config: ClientConfig): APIClient;

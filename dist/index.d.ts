import * as astro from 'astro';
import { AstroCookies, AstroIntegration, MiddlewareHandler } from 'astro';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Token bundle returned from auth endpoints
 */
interface TokenBundle {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
    refreshExpiresAt?: number;
    sessionPayload?: Record<string, any>;
}
/**
 * Minimal context required by TokenKit
 */
interface TokenKitContext {
    cookies: AstroCookies;
    [key: string]: any;
}
/**
 * Session information
 */
interface Session {
    accessToken: string;
    expiresAt: number;
    payload?: Record<string, any>;
}
/**
 * Request options
 */
interface RequestOptions {
    /** Astro context (optional if middleware binds it) */
    ctx?: TokenKitContext;
    /** Additional headers */
    headers?: Record<string, string>;
    /** Request timeout in ms */
    timeout?: number;
    /** Query parameters */
    params?: Record<string, any>;
    /** Skip authentication for this request */
    skipAuth?: boolean;
    /** Custom signal for cancellation */
    signal?: AbortSignal;
}
/**
 * Request configuration
 */
interface RequestConfig extends RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    data?: any;
}
/**
 * HTTP response
 */
interface APIResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
    url: string;
}
/**
 * Field mapping for auto-detection
 */
interface FieldMapping {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    expiresIn?: string;
    sessionPayload?: string;
}
/**
 * Auth configuration
 */
interface AuthConfig {
    /** Login endpoint (relative to baseURL) */
    login: string;
    /** Refresh endpoint (relative to baseURL) */
    refresh: string;
    /** Logout endpoint (optional, relative to baseURL) */
    logout?: string;
    /** Field mapping (auto-detected if not provided) */
    fields?: FieldMapping;
    /** Custom login response parser */
    parseLogin?: (body: any) => TokenBundle;
    /** Custom refresh response parser */
    parseRefresh?: (body: any) => TokenBundle;
    /** Custom token injection function (default: Bearer) */
    injectToken?: (token: string) => string;
    /** Refresh policy */
    policy?: RefreshPolicy;
    /** Cookie configuration */
    cookies?: CookieConfig;
}
/**
 * Refresh policy
 */
interface RefreshPolicy {
    /** Refresh before expiry (e.g., '5m' or 300) */
    refreshBefore?: string | number;
    /** Clock skew tolerance (e.g., '1m' or 60) */
    clockSkew?: string | number;
    /** Minimum interval between refreshes (e.g., '30s' or 30) */
    minInterval?: string | number;
}
/**
 * Cookie configuration
 */
interface CookieConfig {
    /** Secure flag (auto-detected from NODE_ENV if not set) */
    secure?: boolean;
    /** SameSite policy */
    sameSite?: 'strict' | 'lax' | 'none';
    /** Cookie domain */
    domain?: string;
    /** Cookie names prefix */
    prefix?: string;
}
/**
 * Retry configuration
 */
interface RetryConfig {
    /** Number of retry attempts */
    attempts?: number;
    /** Status codes to retry */
    statusCodes?: number[];
    /** Backoff strategy */
    backoff?: 'linear' | 'exponential';
    /** Initial delay in ms */
    delay?: number;
}
/**
 * Request interceptor
 */
type RequestInterceptor = (config: RequestConfig, ctx?: TokenKitContext) => RequestConfig | Promise<RequestConfig>;
/**
 * Response interceptor
 */
type ResponseInterceptor = <T = any>(response: APIResponse<T>, ctx?: TokenKitContext) => APIResponse<T> | Promise<APIResponse<T>>;
/**
 * Error interceptor
 */
type ErrorInterceptor = (error: APIError, ctx?: TokenKitContext) => never | Promise<never>;
/**
 * Interceptors configuration
 */
interface InterceptorsConfig {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
    error?: ErrorInterceptor[];
}
/**
 * Client configuration
 */
interface ClientConfig {
    /** Base URL for all requests */
    baseURL: string;
    /** Auth configuration (optional for non-auth clients) */
    auth?: AuthConfig;
    /** Default headers for all requests */
    headers?: Record<string, string>;
    /** Default timeout in ms */
    timeout?: number;
    /** Retry configuration */
    retry?: RetryConfig;
    /** Interceptors */
    interceptors?: InterceptorsConfig;
    /** External AsyncLocalStorage instance (optional) */
    context?: AsyncLocalStorage<any>;
    /** Method to get the context store (optional) */
    getContextStore?: () => TokenKitContext | undefined | null;
}
/**
 * API Error
 */
declare class APIError extends Error {
    status?: number | undefined;
    response?: any | undefined;
    request?: RequestConfig | undefined;
    constructor(message: string, status?: number | undefined, response?: any | undefined, request?: RequestConfig | undefined);
}
/**
 * Authentication Error
 */
declare class AuthError extends APIError {
    constructor(message: string, status?: number, response?: any, request?: RequestConfig);
}
/**
 * Network Error
 */
declare class NetworkError extends APIError {
    constructor(message: string, request?: RequestConfig);
}
/**
 * Timeout Error
 */
declare class TimeoutError extends APIError {
    constructor(message: string, request?: RequestConfig);
}

/**
 * Token Manager handles all token operations
 */
declare class TokenManager {
    private config;
    private singleFlight;
    private baseURL;
    constructor(config: AuthConfig, baseURL: string);
    /**
     * Perform login
     */
    login(ctx: TokenKitContext, credentials: any): Promise<TokenBundle>;
    /**
     * Perform token refresh
     */
    refresh(ctx: TokenKitContext, refreshToken: string): Promise<TokenBundle | null>;
    /**
     * Ensure valid tokens (with automatic refresh)
     */
    ensure(ctx: TokenKitContext): Promise<Session | null>;
    /**
     * Logout (clear tokens)
     */
    logout(ctx: TokenKitContext): Promise<void>;
    /**
     * Get current session (no refresh)
     */
    getSession(ctx: TokenKitContext): Session | null;
    /**
     * Check if authenticated
     */
    isAuthenticated(ctx: TokenKitContext): boolean;
    /**
     * Create flight key for single-flight deduplication
     */
    private createFlightKey;
}

/**
 * Configuration for context handling
 */
interface ContextOptions {
    context?: AsyncLocalStorage<any>;
    getContextStore?: () => TokenKitContext | undefined | null;
}

/**
 * API Client
 */
declare class APIClient {
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
declare function createClient(config: ClientConfig): APIClient;

/**
 * Astro integration for TokenKit
 *
 * This integration facilitates the setup of TokenKit in an Astro project.
 */
declare function tokenKit(client?: APIClient): AstroIntegration;
/**
 * Helper to define middleware in a separate file if needed
 */
declare const defineMiddleware: (client: APIClient) => astro.MiddlewareHandler;

/**
 * Create middleware for context binding and automatic token rotation
 */
declare function createMiddleware(client: APIClient): MiddlewareHandler;

/**
 * Parse time string to seconds
 * Supports: '5m', '30s', '1h', '2d'
 */
declare function parseTime(input: string | number): number;
/**
 * Format seconds to human-readable string
 */
declare function formatTime(seconds: number): string;

export { APIClient, APIError, AuthError, NetworkError, TimeoutError, createClient, createMiddleware, defineMiddleware, formatTime, parseTime, tokenKit };
export type { APIResponse, AuthConfig, ClientConfig, CookieConfig, ErrorInterceptor, FieldMapping, RefreshPolicy, RequestConfig, RequestInterceptor, RequestOptions, ResponseInterceptor, RetryConfig, Session, TokenBundle, TokenKitContext };

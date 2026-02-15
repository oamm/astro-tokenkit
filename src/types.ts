// packages/astro-tokenkit/src/types.ts

import type { AstroCookies } from 'astro';
import type { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Token bundle returned from auth endpoints
 */
export interface TokenBundle {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number; // Unix timestamp in seconds
    tokenType?: string;
    refreshExpiresAt?: number;
    sessionPayload?: Record<string, any>;
}

/**
 * Minimal context required by TokenKit
 */
export interface TokenKitContext {
    cookies: AstroCookies;
    [key: string]: any;
}


/**
 * Session information
 */
export interface Session {
    accessToken: string;
    expiresAt: number;
    tokenType?: string;
    payload?: Record<string, any>;
}

/**
 * Request options
 */
export interface RequestOptions {
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
    /** Auth override options for automatic refresh if triggered */
    auth?: AuthOptions;
}

/**
 * Request configuration
 */
export interface RequestConfig extends RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    data?: any;
}

/**
 * HTTP response
 */
export interface APIResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Headers;
    url: string;
    ok: boolean;
}

/**
 * Field mapping for auto-detection
 */
export interface FieldMapping {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    expiresIn?: string;
    tokenType?: string;
    sessionPayload?: string;
}

/**
 * Callback after successful login
 */
export type OnLoginCallback = (bundle: TokenBundle, body: any, ctx: TokenKitContext) => void | Promise<void>;

/**
 * Callback after failed login
 */
export type OnErrorCallback = (error: AuthError, ctx: TokenKitContext) => void | Promise<void>;

/**
 * Auth override options
 */
export interface AuthOptions {
    /** Extra data for this specific auth request (login/refresh) */
    data?: Record<string, any>;
    /** Request timeout in ms for this auth request */
    timeout?: number;
}

/**
 * Login options
 */
export interface LoginOptions extends AuthOptions {
    /** Extra headers for this specific login request */
    headers?: Record<string, string>;
    /** Request timeout in ms for this login request */
    timeout?: number;
    /** Callback after successful login */
    onLogin?: OnLoginCallback;
    /** Callback after failed login */
    onError?: OnErrorCallback;
}

/**
 * Auth configuration
 */
export interface AuthConfig {
    /** Login endpoint (relative to baseURL) */
    login: string;
    /** Refresh endpoint (relative to baseURL) */
    refresh: string;
    /** Logout endpoint (optional, relative to baseURL) */
    logout?: string;

    /** Content type for auth requests (default: 'application/json') */
    contentType?: 'application/json' | 'application/x-www-form-urlencoded';

    /** Extra headers for login/refresh requests */
    headers?: Record<string, string>;

    /** Extra data for login request */
    loginData?: Record<string, any>;

    /** Extra data for refresh request */
    refreshData?: Record<string, any>;

    /** Field name for refresh token in refresh request (default: 'refreshToken') */
    refreshRequestField?: string;

    /** Field mapping (auto-detected if not provided) */
    fields?: FieldMapping;

    /** Custom login response parser */
    parseLogin?: (body: any) => TokenBundle;
    /** Custom refresh response parser */
    parseRefresh?: (body: any) => TokenBundle;

    /** Custom token injection function (default: Bearer) */
    injectToken?: (token: string, type?: string) => string;

    /** Request timeout in ms for auth requests (login, refresh, logout) */
    timeout?: number;

    /** Refresh policy */
    policy?: RefreshPolicy;

    /** Cookie configuration */
    cookies?: CookieConfig;

    /** Custom fetch implementation */
    fetch?: typeof fetch;

    /** Dangerously ignore certificate errors (bypass SSL validation) */
    dangerouslyIgnoreCertificateErrors?: boolean;
}

/**
 * Refresh policy
 */
export interface RefreshPolicy {
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
export interface CookieConfig {
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
export interface RetryConfig {
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
 * Idle timeout configuration
 */
export interface IdleConfig {
    /** Idle timeout in seconds */
    timeout: number;
    /** 
     * Callback when idle timeout is reached.
     * NOTE: This function is only used if you manually initialize IdleManager.
     * If using the Astro integration, use window.addEventListener('tk:idle', ...) instead.
     */
    onIdle?: () => void;
    /** Whether to automatically logout on idle (default: true) */
    autoLogout?: boolean;
    /** Whether to monitor activity only on the active tab (default: true) */
    activeTabOnly?: boolean;
    /** 
     * Custom data to pass to the 'tk:idle' event. 
     * Ideal for configuring client-side alerts (e.g. SweetAlert).
     */
    alert?: AlertOptions | any;
}

/**
 * Alert options for client-side notifications (e.g. SweetAlert)
 */
export interface AlertOptions {
    title?: string;
    text?: string;
    icon?: 'success' | 'error' | 'warning' | 'info' | 'question' | string;
    [key: string]: any;
}

/**
 * Request interceptor
 */
export type RequestInterceptor = (
    config: RequestConfig,
    ctx?: TokenKitContext
) => RequestConfig | Promise<RequestConfig>;

/**
 * Response interceptor
 */
export type ResponseInterceptor = <T = any>(
    response: APIResponse<T>,
    ctx?: TokenKitContext
) => APIResponse<T> | Promise<APIResponse<T>>;

/**
 * Error interceptor
 */
export type ErrorInterceptor = (
    error: APIError,
    ctx?: TokenKitContext
) => never | Promise<never>;

/**
 * Interceptors configuration
 */
export interface InterceptorsConfig {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
    error?: ErrorInterceptor[];
}

/**
 * Client configuration
 */
export interface ClientConfig {
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

    /** Idle timeout configuration */
    idle?: IdleConfig;
    
    /** AsyncLocalStorage instance (Node only) */
    context?: AsyncLocalStorage<any>;
    
    /** Custom context store getter */
    getContextStore?: () => TokenKitContext | undefined | null;

    /** Custom context store setter */
    setContextStore?: (ctx: TokenKitContext) => void;
    
    /** Custom context runner */
    runWithContext?: <T>(ctx: TokenKitContext, fn: () => T) => T;

    /** Custom fetch implementation */
    fetch?: typeof fetch;

    /** Enable debug logging */
    debug?: boolean;

    /** Dangerously ignore certificate errors (bypass SSL validation) */
    dangerouslyIgnoreCertificateErrors?: boolean;
}

/**
 * TokenKit Global Configuration
 */
export interface TokenKitConfig extends Partial<ClientConfig> {
    /** 
     * Whether to automatically inject the middleware (default: true).
     * If false, you must manually export onRequest = api.middleware() in src/middleware.ts
     */
    autoMiddleware?: boolean;
}

/**
 * API Error
 */
export class APIError extends Error {
    constructor(
        message: string,
        public status?: number,
        public response?: any,
        public request?: RequestConfig,
        public cause?: any
    ) {
        super(message);
        this.name = 'APIError';
        if (cause && !this.cause) this.cause = cause;
    }
}

/**
 * Authentication Error
 */
export class AuthError extends APIError {
    constructor(message: string, status?: number, response?: any, request?: RequestConfig, cause?: any) {
        super(message, status, response, request, cause);
        this.name = 'AuthError';
    }
}

/**
 * Network Error
 */
export class NetworkError extends APIError {
    constructor(message: string, request?: RequestConfig, cause?: any) {
        super(message, undefined, undefined, request, cause);
        this.name = 'NetworkError';
    }
}

/**
 * Timeout Error
 */
export class TimeoutError extends APIError {
    constructor(message: string, request?: RequestConfig, cause?: any) {
        super(message, undefined, undefined, request, cause);
        this.name = 'TimeoutError';
    }
}
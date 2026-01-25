// packages/astro-tokenkit/src/types.ts

import type { AstroGlobal } from 'astro';

/**
 * Token bundle returned from auth endpoints
 */
export interface TokenBundle {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number; // Unix timestamp in seconds
    refreshExpiresAt?: number;
    sessionPayload?: Record<string, any>;
}

/**
 * Session information
 */
export interface Session {
    accessToken: string;
    expiresAt: number;
    payload?: Record<string, any>;
}

/**
 * Request options
 */
export interface RequestOptions {
    /** Astro context (optional if middleware binds it) */
    ctx?: AstroGlobal;
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
}

/**
 * Field mapping for auto-detection
 */
export interface FieldMapping {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    expiresIn?: string;
    sessionPayload?: string;
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
 * Request interceptor
 */
export type RequestInterceptor = (
    config: RequestConfig,
    ctx?: AstroGlobal
) => RequestConfig | Promise<RequestConfig>;

/**
 * Response interceptor
 */
export type ResponseInterceptor = <T = any>(
    response: APIResponse<T>,
    ctx?: AstroGlobal
) => APIResponse<T> | Promise<APIResponse<T>>;

/**
 * Error interceptor
 */
export type ErrorInterceptor = (
    error: APIError,
    ctx?: AstroGlobal
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
}

/**
 * API Error
 */
export class APIError extends Error {
    constructor(
        message: string,
        public status?: number,
        public response?: any,
        public request?: RequestConfig
    ) {
        super(message);
        this.name = 'APIError';
    }
}

/**
 * Authentication Error
 */
export class AuthError extends APIError {
    constructor(message: string, status?: number, response?: any, request?: RequestConfig) {
        super(message, status, response, request);
        this.name = 'AuthError';
    }
}

/**
 * Network Error
 */
export class NetworkError extends APIError {
    constructor(message: string, request?: RequestConfig) {
        super(message, undefined, undefined, request);
        this.name = 'NetworkError';
    }
}

/**
 * Timeout Error
 */
export class TimeoutError extends APIError {
    constructor(message: string, request?: RequestConfig) {
        super(message, undefined, undefined, request);
        this.name = 'TimeoutError';
    }
}
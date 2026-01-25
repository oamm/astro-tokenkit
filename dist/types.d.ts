import type { AstroCookies } from 'astro';
import { AsyncLocalStorage } from 'node:async_hooks';
/**
 * Token bundle returned from auth endpoints
 */
export interface TokenBundle {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: number;
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
    payload?: Record<string, any>;
}
/**
 * Request options
 */
export interface RequestOptions {
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
export type RequestInterceptor = (config: RequestConfig, ctx?: TokenKitContext) => RequestConfig | Promise<RequestConfig>;
/**
 * Response interceptor
 */
export type ResponseInterceptor = <T = any>(response: APIResponse<T>, ctx?: TokenKitContext) => APIResponse<T> | Promise<APIResponse<T>>;
/**
 * Error interceptor
 */
export type ErrorInterceptor = (error: APIError, ctx?: TokenKitContext) => never | Promise<never>;
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
    /** External AsyncLocalStorage instance (optional) */
    context?: AsyncLocalStorage<any>;
    /** Method to get the context store (optional) */
    getContextStore?: () => TokenKitContext | undefined | null;
}
/**
 * API Error
 */
export declare class APIError extends Error {
    status?: number | undefined;
    response?: any | undefined;
    request?: RequestConfig | undefined;
    constructor(message: string, status?: number | undefined, response?: any | undefined, request?: RequestConfig | undefined);
}
/**
 * Authentication Error
 */
export declare class AuthError extends APIError {
    constructor(message: string, status?: number, response?: any, request?: RequestConfig);
}
/**
 * Network Error
 */
export declare class NetworkError extends APIError {
    constructor(message: string, request?: RequestConfig);
}
/**
 * Timeout Error
 */
export declare class TimeoutError extends APIError {
    constructor(message: string, request?: RequestConfig);
}

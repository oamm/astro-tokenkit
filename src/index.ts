// packages/astro-tokenkit/src/index.ts

// Main client
export { createClient, APIClient, api } from './client/client';

// Integration
export { tokenKit, defineMiddleware } from './integration';

// Middleware
export { createMiddleware } from './middleware';

// Configuration
export { setConfig, getConfig, setTokenManager, getTokenManager } from './config';

// Types
export type {
    ClientConfig,
    AuthConfig,
    RefreshPolicy,
    CookieConfig,
    RetryConfig,
    RequestOptions,
    RequestConfig,
    APIResponse,
    Session,
    TokenBundle,
    FieldMapping,
    RequestInterceptor,
    ResponseInterceptor,
    ErrorInterceptor,
    TokenKitContext,
    TokenKitConfig,
    ProtectionRule,
    AccessHooks,
} from './types';

// Errors
export {
    APIError,
    AuthError,
    NetworkError,
    TimeoutError,
} from './types';

// Utilities (for advanced users)
export { parseTime, formatTime } from './utils/time';
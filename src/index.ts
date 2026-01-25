// packages/astro-tokenkit/src/index.ts

// Main client
export { createClient, APIClient } from './client/client';

// Integration
export { tokenKit, defineMiddleware } from './integration';

// Middleware
export { createMiddleware } from './middleware';

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
    TokenKitContext
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
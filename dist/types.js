// packages/astro-tokenkit/src/types.ts
/**
 * API Error
 */
export class APIError extends Error {
    constructor(message, status, response, request) {
        super(message);
        this.status = status;
        this.response = response;
        this.request = request;
        this.name = 'APIError';
    }
}
/**
 * Authentication Error
 */
export class AuthError extends APIError {
    constructor(message, status, response, request) {
        super(message, status, response, request);
        this.name = 'AuthError';
    }
}
/**
 * Network Error
 */
export class NetworkError extends APIError {
    constructor(message, request) {
        super(message, undefined, undefined, request);
        this.name = 'NetworkError';
    }
}
/**
 * Timeout Error
 */
export class TimeoutError extends APIError {
    constructor(message, request) {
        super(message, undefined, undefined, request);
        this.name = 'TimeoutError';
    }
}

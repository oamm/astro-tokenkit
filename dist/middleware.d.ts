import type { MiddlewareHandler } from 'astro';
import type { APIClient } from './client/client';
/**
 * Create middleware for context binding and automatic token rotation
 */
export declare function createMiddleware(client: APIClient): MiddlewareHandler;

import type { AstroIntegration } from 'astro';
import type { APIClient } from './client/client';
/**
 * Astro integration for TokenKit
 *
 * This integration facilitates the setup of TokenKit in an Astro project.
 */
export declare function tokenKit(client?: APIClient): AstroIntegration;
/**
 * Helper to define middleware in a separate file if needed
 */
export declare const defineMiddleware: (client: APIClient) => import("astro").MiddlewareHandler;

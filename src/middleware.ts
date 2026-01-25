// packages/astro-tokenkit/src/middleware.ts

import type { MiddlewareHandler } from 'astro';
import type { APIClient } from './client/client';
import { bindContext } from './client/context';

/**
 * Create middleware for context binding and automatic token rotation
 */
export function createMiddleware(client: APIClient): MiddlewareHandler {
    return async (ctx, next) => {
        const tokenManager = client.tokenManager;
        const contextOptions = client.contextOptions;

        const runLogic = async () => {
            // Proactively ensure valid session if auth is configured
            if (tokenManager) {
                try {
                    // This handles token rotation (refresh) if needed
                    await tokenManager.ensure(ctx);
                } catch (error) {
                    // Log but don't block request if rotation fails
                    console.error('[TokenKit] Automatic token rotation failed:', error);
                }
            }
            return next();
        };

        // If getContextStore is defined, it means the context is managed externally (e.g., by a superior ALS)
        // We skip bindContext to avoid nesting ALS.run() unnecessarily.
        if (contextOptions?.getContextStore) {
            return runLogic();
        }

        return bindContext(ctx, runLogic, contextOptions);
    };
}

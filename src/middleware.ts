// packages/astro-tokenkit/src/middleware.ts

import type {MiddlewareHandler} from 'astro';
import {runWithContext as defaultRunWithContext} from './client/context';
import {getConfig, getTokenManager} from './config';

/**
 * Create middleware for context binding and automatic token rotation
 */
export function createMiddleware(): MiddlewareHandler {
    return async (ctx, next) => {
        const tokenManager = getTokenManager();
        const config = getConfig();

        const runLogic = async () => {
            // Proactively ensure a valid session if auth is configured
            if (tokenManager) {
                try {
                    // This handles token rotation (refresh) if needed
                    await tokenManager.ensure(ctx);
                } catch (error: any) {
                    // Log only the message to avoid leaking sensitive data in the error object
                    console.error('[TokenKit] Automatic token rotation failed:', error.message || error);
                }
            }
            return next();
        };

        // If getContextStore is defined, it means the context is managed externally (e.g., by a superior ALS)
        // We skip runWithContext to avoid nesting ALS.run() unnecessarily,
        // UNLESS a custom runWithContext is provided.
        if (config.getContextStore && !config.runWithContext) {
            let storage = config.getContextStore();

            if (storage)
                // Update existing reference
                storage.cookies = ctx.cookies;
            else if (config.setContextStore)
                config.setContextStore({cookies: ctx.cookies});
            else
                console.error("[TokenKit] getContextStore returned null or undefined and no setter was found");
            return runLogic();
        }
        const runner = config.runWithContext ?? defaultRunWithContext;
        return runner(ctx, runLogic);
    };
}

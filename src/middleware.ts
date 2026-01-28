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

        const setupAndRun = async () => {
            if (config.setContextStore) {
                config.setContextStore(ctx);
            }
            return runLogic();
        };

        if (config.runWithContext) {
            return config.runWithContext(ctx, setupAndRun);
        }

        if (config.setContextStore) {
            return setupAndRun();
        }

        return defaultRunWithContext(ctx, runLogic);
    };
}

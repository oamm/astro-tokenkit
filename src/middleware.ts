// packages/astro-tokenkit/src/middleware.ts

import type { MiddlewareHandler } from 'astro';
import { runWithContext as defaultRunWithContext } from './client/context';
import { getConfig, getTokenManager } from './config';

/**
 * Create middleware for context binding and automatic token rotation
 */
export function createMiddleware(): MiddlewareHandler {
    return async (ctx, next) => {
        const tokenManager = getTokenManager();
        const config = getConfig();

        // 1. Check protection rules
        const pathname = new URL(ctx.request.url).pathname;
        const matchingRule = config.protect.find(rule => pathname.startsWith(rule.pattern));

        if (matchingRule) {
            const session = tokenManager?.getSession(ctx);
            const isAuthenticated = !!session?.accessToken;

            if (!isAuthenticated) {
                const redirectTo = matchingRule.redirectTo || config.loginPath;
                return ctx.redirect(redirectTo);
            }

            // 2. Check rule-specific requirements
            const redirectTo = matchingRule.redirectTo || config.loginPath;

            if (matchingRule.role) {
                const role = await config.access.getRole(session);
                if (role !== matchingRule.role) {
                    return ctx.redirect(redirectTo);
                }
            }

            if (matchingRule.roles) {
                const role = await config.access.getRole(session);
                if (!role || !matchingRule.roles.includes(role)) {
                    return ctx.redirect(redirectTo);
                }
            }

            if (matchingRule.permissions) {
                const permissions = await config.access.getPermissions(session);
                const hasAll = matchingRule.permissions.every(p => permissions.includes(p));
                if (!hasAll) {
                    return ctx.redirect(redirectTo);
                }
            }

            // 3. Check global access hook if authenticated
            if (config.access.check) {
                const hasAccess = await config.access.check(session || null, ctx);
                if (!hasAccess) {
                    return ctx.redirect(config.loginPath);
                }
            }
        }

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
        // We skip runWithContext to avoid nesting ALS.run() unnecessarily,
        // UNLESS a custom runWithContext is provided.
        if (config.getContextStore && !config.runWithContext) {
            return runLogic();
        }

        return defaultRunWithContext(ctx, runLogic);
    };
}

// packages/astro-tokenkit/src/client/context.ts

import type { AstroGlobal } from 'astro';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Async local storage for Astro context
 */
const contextStorage = new AsyncLocalStorage<AstroGlobal>();

/**
 * Bind Astro context for the current async scope
 */
export function bindContext<T>(ctx: AstroGlobal, fn: () => T): T {
    return contextStorage.run(ctx, fn);
}

/**
 * Get current Astro context (from middleware binding or explicit)
 */
export function getContext(explicitCtx?: AstroGlobal): AstroGlobal {
    const ctx = explicitCtx || contextStorage.getStore();

    if (!ctx) {
        throw new Error(
            'Astro context not found. Either:\n' +
            '1. Use api.middleware() to bind context automatically, or\n' +
            '2. Pass context explicitly: api.get("/path", { ctx: Astro })'
        );
    }

    return ctx;
}

/**
 * Check if context is available
 */
export function hasContext(explicitCtx?: AstroGlobal): boolean {
    return !!(explicitCtx || contextStorage.getStore());
}
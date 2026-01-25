// packages/astro-tokenkit/src/client/context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
/**
 * Async local storage for Astro context
 */
const defaultContextStorage = new AsyncLocalStorage();
/**
 * Bind Astro context for the current async scope
 */
export function bindContext(ctx, fn, options) {
    const storage = (options === null || options === void 0 ? void 0 : options.context) || defaultContextStorage;
    return storage.run(ctx, fn);
}
/**
 * Get current Astro context (from middleware binding or explicit)
 */
export function getContext(explicitCtx, options) {
    const store = (options === null || options === void 0 ? void 0 : options.getContextStore)
        ? options.getContextStore()
        : ((options === null || options === void 0 ? void 0 : options.context) || defaultContextStorage).getStore();
    const ctx = explicitCtx || store;
    if (!ctx) {
        throw new Error('Astro context not found. Either:\n' +
            '1. Use api.middleware() to bind context automatically, or\n' +
            '2. Pass context explicitly: api.get("/path", { ctx: Astro })');
    }
    return ctx;
}
/**
 * Check if context is available
 */
export function hasContext(explicitCtx, options) {
    const store = (options === null || options === void 0 ? void 0 : options.getContextStore)
        ? options.getContextStore()
        : ((options === null || options === void 0 ? void 0 : options.context) || defaultContextStorage).getStore();
    return !!(explicitCtx || store);
}

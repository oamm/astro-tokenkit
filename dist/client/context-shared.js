// packages/astro-tokenkit/src/client/context-shared.ts
/**
 * OPTION: Share AsyncLocalStorage with other libraries
 *
 * If you have another library (like SessionKit) that uses AsyncLocalStorage,
 * you can share the same instance to avoid performance overhead.
 *
 * Usage:
 *
 * // In your shared context file:
 * import { AsyncLocalStorage } from 'node:async_hooks';
 * export const appContext = new AsyncLocalStorage<{ astro: TokenKitContext }>();
 *
 * // Then configure TokenKit to use it:
 * import { setSharedContextStorage } from 'astro-tokenkit';
 * import { appContext } from './shared-context';
 *
 * setSharedContextStorage(appContext, 'astro');
 */
let sharedStorage = null;
let contextKey = null;
/**
 * Configure shared AsyncLocalStorage
 *
 * @param storage - Shared AsyncLocalStorage instance
 * @param key - Key to access Astro context in the storage
 */
export function setSharedContextStorage(storage, key = 'astro') {
    sharedStorage = storage;
    contextKey = key;
}
/**
 * Get context from shared storage
 */
export function getContext(explicitCtx) {
    if (explicitCtx) {
        return explicitCtx;
    }
    if (sharedStorage && contextKey) {
        const store = sharedStorage.getStore();
        const ctx = store === null || store === void 0 ? void 0 : store[contextKey];
        if (ctx) {
            return ctx;
        }
    }
    throw new Error('Astro context not found. Either:\n' +
        '1. Pass context explicitly: api.get("/path", { ctx: Astro })\n' +
        '2. Configure shared storage: setSharedContextStorage(storage, "key")');
}
/**
 * Bind context (only needed if not using shared storage)
 */
export function bindContext(ctx, fn) {
    if (sharedStorage && contextKey) {
        const currentStore = sharedStorage.getStore() || {};
        return sharedStorage.run(Object.assign(Object.assign({}, currentStore), { [contextKey]: ctx }), fn);
    }
    // Fallback: context must be passed explicitly
    return fn();
}

// packages/astro-tokenkit/src/client/context-shared.ts

import type { TokenKitContext } from '../types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getConfig } from '../config';

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

let sharedStorage: AsyncLocalStorage<any> | null = null;
let contextKey: string | null = null;

/**
 * Configure shared AsyncLocalStorage
 *
 * @param storage - Shared AsyncLocalStorage instance
 * @param key - Key to access Astro context in the storage
 */
export function setSharedContextStorage(
    storage: AsyncLocalStorage<any>,
    key: string = 'astro'
): void {
    sharedStorage = storage;
    contextKey = key;
}

/**
 * Get context from shared storage
 */
export function getContextStore(): TokenKitContext {
    const config = getConfig();
    const getStore = config.getContextStore;

    if (getStore) {
        const ctx = getStore();
        if (ctx) return ctx;
    }

    if (sharedStorage && contextKey) {
        const store = sharedStorage.getStore();
        const ctx = store?.[contextKey];
        if (ctx) {
            return ctx;
        }
    }

    throw new Error(
        'Astro context not found. Make sure to use api.middleware() to bind context automatically.'
    );
}

/**
 * Bind context (only needed if not using shared storage)
 */
export function runWithContext<T>(ctx: TokenKitContext, fn: () => T): T {
    const config = getConfig();
    const runner = config.runWithContext;

    if (runner) {
        return runner(ctx, fn);
    }
    
    if (sharedStorage && contextKey) {
        const currentStore = sharedStorage.getStore() || {};
        return sharedStorage.run({ ...currentStore, [contextKey]: ctx }, fn);
    }

    // Fallback: context must be passed explicitly
    return fn();
}
// packages/astro-tokenkit/src/client/context.ts

import { AsyncLocalStorage } from 'node:async_hooks';
import type { TokenKitContext } from '../types';
import { getConfig } from '../config';

/**
 * Async local storage for Astro context
 */
const als = new AsyncLocalStorage<TokenKitContext>();

/**
 * Bind Astro context for the current async scope
 */
export function runWithContext<T>(ctx: TokenKitContext, fn: () => T): T {
    const config = getConfig();
    const runner = config.runWithContext;

    if (runner) {
        return runner(ctx, fn);
    }

    return als.run(ctx, fn);
}

/**
 * Get current Astro context (from middleware binding or explicit)
 */
export function getContextStore(): TokenKitContext {
    const config = getConfig();
    const getStore = config.getContextStore;
    const context = (config as any).context || als;

    const store = getStore 
        ? getStore() 
        : (context as AsyncLocalStorage<TokenKitContext>).getStore();
    
    if (!store) {
        throw new Error(
            'Astro context not found. Make sure to use api.middleware() to bind context automatically.'
        );
    }

    return store;
}

/**
 * Check if context is available
 */
export function hasContext(): boolean {
    const config = getConfig();
    const getStore = config.getContextStore;
    const context = (config as any).context || als;

    const store = getStore 
        ? getStore() 
        : (context as AsyncLocalStorage<TokenKitContext>).getStore();

    return !!store;
}
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
export function getContextStore(explicitCtx?: TokenKitContext): TokenKitContext {
    const config = getConfig();
    const getStore = config.getContextStore;
    const context = (config as any).context || als;

    const store = getStore 
        ? getStore() 
        : (context as AsyncLocalStorage<TokenKitContext>).getStore();
    
    const ctx = explicitCtx || store;

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
export function hasContext(explicitCtx?: TokenKitContext): boolean {
    const config = getConfig();
    const getStore = config.getContextStore;
    const context = (config as any).context || als;

    const store = getStore 
        ? getStore() 
        : (context as AsyncLocalStorage<TokenKitContext>).getStore();

    return !!(explicitCtx || store);
}
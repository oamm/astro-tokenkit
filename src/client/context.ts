// packages/astro-tokenkit/src/client/context.ts

import { AsyncLocalStorage } from 'node:async_hooks';
import type { TokenKitContext } from '../types';

/**
 * Async local storage for Astro context
 */
const defaultContextStorage = new AsyncLocalStorage<TokenKitContext>();

/**
 * Configuration for context handling
 */
export interface ContextOptions {
    context?: AsyncLocalStorage<any>;
    getContextStore?: () => TokenKitContext | undefined | null;
}

/**
 * Bind Astro context for the current async scope
 */
export function bindContext<T>(ctx: TokenKitContext, fn: () => T, options?: ContextOptions): T {
    const storage = options?.context || defaultContextStorage;
    return storage.run(ctx, fn);
}

/**
 * Get current Astro context (from middleware binding or explicit)
 */
export function getContext(explicitCtx?: TokenKitContext, options?: ContextOptions): TokenKitContext {
    const store = options?.getContextStore 
        ? options.getContextStore() 
        : (options?.context || defaultContextStorage).getStore();
    
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
export function hasContext(explicitCtx?: TokenKitContext, options?: ContextOptions): boolean {
    const store = options?.getContextStore 
        ? options.getContextStore() 
        : (options?.context || defaultContextStorage).getStore();

    return !!(explicitCtx || store);
}
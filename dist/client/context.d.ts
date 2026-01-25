import { AsyncLocalStorage } from 'node:async_hooks';
import type { TokenKitContext } from '../types';
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
export declare function bindContext<T>(ctx: TokenKitContext, fn: () => T, options?: ContextOptions): T;
/**
 * Get current Astro context (from middleware binding or explicit)
 */
export declare function getContext(explicitCtx?: TokenKitContext, options?: ContextOptions): TokenKitContext;
/**
 * Check if context is available
 */
export declare function hasContext(explicitCtx?: TokenKitContext, options?: ContextOptions): boolean;

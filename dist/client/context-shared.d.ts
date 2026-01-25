import type { TokenKitContext } from '../types';
import { AsyncLocalStorage } from 'node:async_hooks';
/**
 * Configure shared AsyncLocalStorage
 *
 * @param storage - Shared AsyncLocalStorage instance
 * @param key - Key to access Astro context in the storage
 */
export declare function setSharedContextStorage(storage: AsyncLocalStorage<any>, key?: string): void;
/**
 * Get context from shared storage
 */
export declare function getContext(explicitCtx?: TokenKitContext): TokenKitContext;
/**
 * Bind context (only needed if not using shared storage)
 */
export declare function bindContext<T>(ctx: TokenKitContext, fn: () => T): T;

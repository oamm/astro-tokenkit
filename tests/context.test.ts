import { describe, it, expect, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getContext, bindContext } from '../src/client/context';
import type { TokenKitContext } from '../src/types';

describe('context handling', () => {
    const mockAstro = {
        cookies: new Map(),
        request: new Request('http://localhost'),
    } as unknown as TokenKitContext;

    it('should use default internal storage', () => {
        bindContext(mockAstro, () => {
            const ctx = getContext();
            expect(ctx).toBe(mockAstro);
        });
    });

    it('should use external AsyncLocalStorage', () => {
        const externalStorage = new AsyncLocalStorage<any>();
        const options = { context: externalStorage };

        externalStorage.run(mockAstro, () => {
            const ctx = getContext(undefined, options);
            expect(ctx).toBe(mockAstro);
        });

        // Should fail if not in external storage scope
        expect(() => getContext(undefined, options)).toThrow();
    });

    it('should use getContextStore', () => {
        const getContextStore = vi.fn(() => mockAstro);
        const options = { getContextStore };

        const ctx = getContext(undefined, options);
        expect(ctx).toBe(mockAstro);
        expect(getContextStore).toHaveBeenCalled();
    });

    it('should prioritize explicit context', () => {
        const explicitAstro = { id: 'explicit', cookies: new Map() } as unknown as TokenKitContext;
        const storeAstro = { id: 'store', cookies: new Map() } as unknown as TokenKitContext;
        const getContextStore = () => storeAstro;
        const options = { getContextStore };

        const ctx = getContext(explicitAstro, options);
        expect(ctx).toBe(explicitAstro);
    });

    it('should throw if no context is found', () => {
        expect(() => getContext()).toThrow('Astro context not found');
    });

    it('should support APIContext as well', () => {
        const mockAPIContext = {
            cookies: new Map(),
            request: new Request('http://localhost'),
            locals: {}
        } as unknown as APIContext;

        bindContext(mockAPIContext, () => {
            const ctx = getContext();
            expect(ctx).toBe(mockAPIContext);
        });
    });
});

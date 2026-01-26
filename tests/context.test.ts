import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getContextStore, runWithContext } from '../src/client/context';
import type { TokenKitContext } from '../src';
import type { APIContext } from 'astro';
import { setConfig } from '../src/config';

describe('context handling', () => {
    const mockAstro = {
        cookies: new Map(),
        request: new Request('http://localhost'),
    } as unknown as TokenKitContext;

    beforeEach(() => {
        // Reset config before each test
        setConfig({
            getContextStore: undefined,
            runWithContext: undefined,
            context: undefined,
        });
    });

    it('should use default internal storage', () => {
        runWithContext(mockAstro, () => {
            const ctx = getContextStore();
            expect(ctx).toBe(mockAstro);
        });
    });

    it('should use external AsyncLocalStorage', () => {
        const externalStorage = new AsyncLocalStorage<any>();
        setConfig({ context: externalStorage });

        externalStorage.run(mockAstro, () => {
            const ctx = getContextStore();
            expect(ctx).toBe(mockAstro);
        });

        // Should fail if not in external storage scope
        expect(() => getContextStore()).toThrow();
    });

    it('should use getContextStore option', () => {
        const customGetContextStore = vi.fn(() => mockAstro);
        setConfig({ getContextStore: customGetContextStore });

        const ctx = getContextStore();
        expect(ctx).toBe(mockAstro);
        expect(customGetContextStore).toHaveBeenCalled();
    });

    it('should prioritize explicit context', () => {
        const explicitAstro = { id: 'explicit', cookies: new Map() } as unknown as TokenKitContext;
        const storeAstro = { id: 'store', cookies: new Map() } as unknown as TokenKitContext;
        const customGetContextStore = () => storeAstro;
        setConfig({ getContextStore: customGetContextStore });

        const ctx = getContextStore(explicitAstro);
        expect(ctx).toBe(explicitAstro);
    });

    it('should use runWithContext option', () => {
        const customRunWithContext = vi.fn((ctx, fn) => fn());
        setConfig({ runWithContext: customRunWithContext });

        runWithContext(mockAstro, () => {
            expect(customRunWithContext).toHaveBeenCalledWith(mockAstro, expect.any(Function));
        });
    });

    it('should throw if no context is found', () => {
        expect(() => getContextStore()).toThrow('Astro context not found');
    });

    it('should support APIContext as well', () => {
        const mockAPIContext = {
            cookies: new Map(),
            request: new Request('http://localhost'),
            locals: {}
        } as unknown as APIContext;

        runWithContext(mockAPIContext, () => {
            const ctx = getContextStore();
            expect(ctx).toBe(mockAPIContext);
        });
    });
});

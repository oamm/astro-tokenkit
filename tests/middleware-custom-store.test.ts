import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMiddleware } from '../src/middleware';
import { setConfig, getConfig } from '../src/config';
import type { APIContext } from 'astro';

describe('Middleware with custom store', () => {
    beforeEach(() => {
        // Reset config
        setConfig({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
            getContextStore: undefined,
            setContextStore: undefined,
            runWithContext: undefined,
        });
    });

    it('should not fail if getContextStore throws when null', async () => {
        let store: any = null;
        const getContextStore = vi.fn(() => {
            if (!store) throw new Error('Store is empty!');
            return store;
        });
        const setContextStore = vi.fn((s) => {
            store = s;
        });

        setConfig({
            getContextStore,
            setContextStore,
        });

        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        // This should not throw if we change the logic to not call getContextStore first
        await expect(middleware(mockCtx, next)).resolves.toBeDefined();
        
        expect(setContextStore).toHaveBeenCalledWith(mockCtx);
        expect(next).toHaveBeenCalled();
    });

    it('should always inject the full context into setContextStore', async () => {
        let store: any = null;
        const setContextStore = vi.fn((s) => {
            store = s;
        });
        const getContextStore = vi.fn(() => store);

        setConfig({
            getContextStore,
            setContextStore,
        });

        const middleware = createMiddleware();
        const mockCtx = {
            cookies: { get: vi.fn() },
            request: new Request('https://example.com'),
            locals: { some: 'data' }
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);

        expect(setContextStore).toHaveBeenCalledWith(mockCtx);
        // Previously it was only passing { cookies: ctx.cookies }
        expect(store).toBe(mockCtx);
    });
});

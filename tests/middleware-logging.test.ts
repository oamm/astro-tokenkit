import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMiddleware, setConfig } from '../src';
import type { APIContext } from 'astro';

describe('Middleware Logging', () => {
    beforeEach(() => {
        // Reset global flag for logging
        const LOGGED_KEY = Symbol.for('astro-tokenkit.middleware.logged');
        delete (globalThis as any)[LOGGED_KEY];
        
        setConfig({
            baseURL: 'https://api.example.com',
            auth: undefined,
            getContextStore: undefined,
            setContextStore: undefined,
            runWithContext: undefined,
            debug: true,
        });
    });

    it('should log default initialization', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[TokenKit] Middleware initialized (auth: disabled, context: default)'));
        spy.mockRestore();
    });

    it('should log custom context store initialization', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        setConfig({
            auth: { login: '/l', refresh: '/r' },
            getContextStore: () => ({}) as any,
            setContextStore: () => {},
        });

        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[TokenKit] Middleware initialized (auth: enabled, context: custom (getter/setter))'));
        spy.mockRestore();
    });

    it('should log custom runWithContext initialization', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        setConfig({
            runWithContext: (ctx, fn) => fn(),
        });

        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);

        expect(spy).toHaveBeenCalledWith(expect.stringContaining('[TokenKit] Middleware initialized (auth: disabled, context: custom (runWithContext))'));
        spy.mockRestore();
    });

    it('should only log once', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);
        await middleware(mockCtx, next);

        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('should not log when debug is false', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        setConfig({
            debug: false,
        });

        const middleware = createMiddleware();
        const mockCtx = {
            cookies: new Map(),
            request: new Request('https://example.com'),
        } as unknown as APIContext;
        const next = vi.fn().mockResolvedValue(new Response());

        await middleware(mockCtx, next);

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

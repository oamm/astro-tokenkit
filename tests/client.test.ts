import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, defineMiddleware, setConfig } from '../src';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { APIContext } from 'astro';

describe('APIClient with global config', () => {
    const mockAstro = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request('http://localhost'),
    } as unknown as APIContext;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset global config
        setConfig({
            baseURL: '',
            auth: undefined,
            getContextStore: undefined,
            setContextStore: undefined,
            runWithContext: undefined,
            context: undefined,
        });
    });

    it('should use global config in login', async () => {
        const getContextStore = vi.fn(() => mockAstro);
        const setContextStore = vi.fn();
        setConfig({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                logout: '/logout',
            },
            getContextStore,
            setContextStore,
        });

        const client = createClient();

        // Mock fetch for login
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'abc', refresh_token: 'def', expires_in: 3600 }),
        });

        await client.login({ username: 'test' });
        expect(getContextStore).toHaveBeenCalled();
        expect(mockAstro.cookies.set).toHaveBeenCalled();
    });

    it('should use external context from global config in request', async () => {
        const externalStorage = new AsyncLocalStorage<any>();
        setConfig({
            baseURL: 'https://api.example.com',
            context: externalStorage,
        });

        const client = createClient();

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });

        await externalStorage.run(mockAstro, async () => {
            const result = await client.get('/test');
            expect(result.data).toEqual({ data: 'ok' });
        });
    });

    it('should use middleware to bind context and rotate tokens via global config', async () => {
        setConfig({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            }
        });

        // Mock cookies for a session that needs refresh
        const now = Math.floor(Date.now() / 1000);
        (mockAstro.cookies.get as any).mockImplementation((name: string) => {
            if (name === 'access_token') return { value: 'old-access' };
            if (name === 'refresh_token') return { value: 'old-refresh' };
            if (name === 'access_expires_at') return { value: (now - 10).toString() }; // Expired
            return null;
        });

        // Mock fetch for refresh
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        });

        const next = vi.fn().mockResolvedValue('next-result');
        const middleware = defineMiddleware();

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
        // Should have called refresh (ensure)
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/refresh'), expect.anything());
        expect(mockAstro.cookies.set).toHaveBeenCalledWith('access_token', 'new-access', expect.anything());
    });

    it('should skip runWithContext in middleware if getContextStore is defined globally', async () => {
        const getContextStore = vi.fn(() => mockAstro);
        const setContextStore = vi.fn();
        setConfig({
            baseURL: 'https://api.example.com',
            getContextStore,
            setContextStore,
        });

        const client = createClient();

        // Mock fetch for the internal request
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
        });

        const next = vi.fn().mockImplementation(async () => {
            await client.get('/test');
            return 'next-result';
        });
        const middleware = defineMiddleware();

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
        expect(setContextStore).toHaveBeenCalledWith(mockAstro);
    });

    it('should NOT skip runWithContext in middleware if both getContextStore and runWithContext are defined globally', async () => {
        const getContextStore = vi.fn(() => mockAstro);
        const setContextStore = vi.fn();
        const runWithContext = vi.fn((ctx, fn) => fn());
        setConfig({
            baseURL: 'https://api.example.com',
            getContextStore,
            setContextStore,
            runWithContext,
        });

        const next = vi.fn().mockResolvedValue('next-result');
        const middleware = defineMiddleware();

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
        expect(runWithContext).toHaveBeenCalled();
    });

    it('should initialize context store via setContextStore if getContextStore returns null', async () => {
        let storedCtx: any = null;
        const getContextStore = vi.fn(() => storedCtx);
        const setContextStore = vi.fn((ctx) => { storedCtx = ctx; });
        
        setConfig({
            baseURL: 'https://api.example.com',
            getContextStore,
            setContextStore,
        });

        const next = vi.fn().mockResolvedValue('next-result');
        const middleware = defineMiddleware();

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
        expect(setContextStore).toHaveBeenCalledWith(mockAstro);
        expect(storedCtx).toBe(mockAstro);
    });
});

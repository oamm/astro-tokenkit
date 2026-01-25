import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, defineMiddleware } from '../src';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { APIContext } from 'astro';

describe('APIClient with context options', () => {
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
    });

    it('should use context options in login', async () => {
        const getContextStore = vi.fn(() => mockAstro);
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                logout: '/logout',
            },
            getContextStore,
        });

        // Mock fetch for login
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'abc', refresh_token: 'def', expires_in: 3600 }),
        });

        await client.login({ username: 'test' });
        expect(getContextStore).toHaveBeenCalled();
        expect(mockAstro.cookies.set).toHaveBeenCalled();
    });

    it('should use external context in request', async () => {
        const externalStorage = new AsyncLocalStorage<any>();
        const client = createClient({
            baseURL: 'https://api.example.com',
            context: externalStorage,
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });

        await externalStorage.run(mockAstro, async () => {
            const result = await client.get('/test');
            expect(result).toEqual({ data: 'ok' });
        });
    });

    it('should use middleware to bind context and rotate tokens', async () => {
        const client = createClient({
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
        const middleware = defineMiddleware(client);

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
        // Should have called refresh (ensure)
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/refresh'), expect.anything());
        expect(mockAstro.cookies.set).toHaveBeenCalledWith('access_token', 'new-access', expect.anything());
    });

    it('should skip bindContext in middleware if getContextStore is defined', async () => {
        const getContextStore = vi.fn(() => mockAstro);
        const client = createClient({
            baseURL: 'https://api.example.com',
            getContextStore,
        });

        const next = vi.fn().mockResolvedValue('next-result');
        const middleware = defineMiddleware(client);

        const result = await middleware(mockAstro, next);

        expect(result).toBe('next-result');
        expect(next).toHaveBeenCalled();
    });
});

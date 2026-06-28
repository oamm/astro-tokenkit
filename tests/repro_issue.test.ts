import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, setConfig } from '../src';
import type { APIContext } from 'astro';

describe('Reproduction of query param issues', () => {
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
        setConfig({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
            getContextStore: () => mockAstro,
            setContextStore: () => {},
        });
    });

    it('should build URL correctly with query params in string', async () => {
        const client = createClient();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
        });

        await client.get('/auth/users?page=0&pageSize=20');
        
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.example.com/auth/users?page=0&pageSize=20',
            expect.anything()
        );
    });

    it('should build URL correctly with query params in options', async () => {
        const client = createClient();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
        });

        await client.get('/auth/users', { params: { page: 0, pageSize: 20 } });
        
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.example.com/auth/users?page=0&pageSize=20',
            expect.anything()
        );
    });

    it('should not double query params if already in URL', async () => {
        const client = createClient();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
        });

        await client.get('/auth/users?page=0', { params: { page: 0 } });
        
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.example.com/auth/users?page=0',
            expect.anything()
        );
    });

    it('should fix interceptors bug', async () => {
        const client = createClient({
            interceptors: {
                request: [
                    async (config) => {
                        return { ...config, url: config.url + '-intercepted' };
                    }
                ]
            }
        });
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
        });

        await client.get('/test');
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('-intercepted'),
            expect.anything()
        );
    });

    it('should not leak query params to refresh request', async () => {
        const now = Math.floor(Date.now() / 1000);
        (mockAstro.cookies.get as any).mockImplementation((name: string) => {
            if (name === 'access_token') return { value: 'old-access' };
            if (name === 'refresh_token') return { value: 'old-refresh' };
            if (name === 'access_expires_at') return { value: (now - 10).toString() };
            return null;
        });

        const client = createClient();
        global.fetch = vi.fn().mockImplementation((url) => {
            if (url.includes('/refresh')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
                });
            }
            return Promise.resolve({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
            });
        });

        await client.get('/auth/users?page=0&pageSize=20');

        // Check refresh call
        const refreshCall = (global.fetch as any).mock.calls.find(call => call[0].includes('/refresh'));
        expect(refreshCall).toBeDefined();
        const refreshBody = JSON.parse(refreshCall[1].body);
        expect(refreshBody).not.toHaveProperty('page');
        expect(refreshBody).not.toHaveProperty('pageSize');
        expect(refreshBody).toHaveProperty('refreshToken', 'old-refresh');
    });
});

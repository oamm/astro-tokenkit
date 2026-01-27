import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext } from '../src';
import type { APIContext } from 'astro';

describe('Multi-tenant support (Auth overrides)', () => {
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

    it('should send custom headers in login', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                headers: { 'x-global': 'global' }
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'abc', refresh_token: 'def', expires_in: 3600 }),
        });

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'test' }, { 
                headers: { 'x-tenant-name': 'lynx' } 
            })
        );

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/login'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'x-global': 'global',
                    'x-tenant-name': 'lynx'
                })
            })
        );
    });

    it('should send custom data in login', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                loginData: { client_id: 'default' }
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ access_token: 'abc', refresh_token: 'def', expires_in: 3600 }),
        });

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'test' }, { 
                data: { client_id: 'overridden', scope: 'offline' } 
            })
        );

        const call = (global.fetch as any).mock.calls[0];
        const body = JSON.parse(call[1].body);
        
        expect(body.client_id).toBe('overridden');
        expect(body.scope).toBe('offline');
        expect(body.username).toBe('test');
    });

    it('should send auth overrides during automatic refresh', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
        });

        // Mock expired session
        const now = Math.floor(Date.now() / 1000);
        (mockAstro.cookies.get as any).mockImplementation((name: string) => {
            if (name === 'access_token') return { value: 'old-access' };
            if (name === 'refresh_token') return { value: 'old-refresh' };
            if (name === 'access_expires_at') return { value: (now - 10).toString() }; // Expired
            return null;
        });

        global.fetch = vi.fn().mockImplementation(async (url) => {
            if (url.includes('/refresh')) {
                return {
                    ok: true,
                    json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
                };
            }
            return {
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
            };
        });

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.get('/test', { 
                headers: { 'x-tenant-name': 'lynx' },
                auth: { 
                    data: { extra: 'param' }
                } 
            })
        );

        // Verify refresh call
        const refreshCall = (global.fetch as any).mock.calls.find((c: any) => c[0].includes('/refresh'));
        expect(refreshCall).toBeDefined();
        
        expect(refreshCall[1].headers).toEqual(expect.objectContaining({
            'x-tenant-name': 'lynx'
        }));
        
        const refreshBody = JSON.parse(refreshCall[1].body);
        expect(refreshBody.extra).toBe('param');
        expect(refreshBody.refreshToken).toBe('old-refresh');
    });
});

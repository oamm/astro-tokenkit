import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, createClient, runWithContext, setConfig } from '../src';
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

describe('Request Isolation and Concurrency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setConfig({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                contentType: 'application/x-www-form-urlencoded',
                refreshRequestField: 'refresh_token',
                loginData: {
                    grant_type: 'password',
                    client_id: 'lynx',
                    client_secret: 'lynx-secret',
                },
                refreshData: {
                    grant_type: 'refresh_token',
                    client_id: 'lynx',
                    client_secret: 'lynx-secret'
                }
            },
        });
    });

    // Helper to create a mock cookie store that persists values
    const createMockCookies = (initial: Record<string, string>) => {
        const store = new Map<string, string>(Object.entries(initial));
        return {
            get: vi.fn((name) => {
                const value = store.get(name);
                return value ? { value } : null;
            }),
            set: vi.fn((name, value) => store.set(name, value)),
            delete: vi.fn((name) => store.delete(name)),
        };
    };

    it('should isolate tokens between different requests using the same api instance', async () => {
        const user1Cookies = createMockCookies({
            'access_token': 'user1-token',
            'refresh_token': 'user1-refresh',
            'access_expires_at': (Math.floor(Date.now() / 1000) + 3600).toString()
        });

        const user2Cookies = createMockCookies({
            'access_token': 'user2-token',
            'refresh_token': 'user2-refresh',
            'access_expires_at': (Math.floor(Date.now() / 1000) + 3600).toString()
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'ok' }),
            headers: new Headers({ 'content-type': 'application/json' }),
            url: 'https://api.example.com/me',
        });

        // Simulating two concurrent requests in their respective contexts
        await Promise.all([
            runWithContext({ cookies: user1Cookies } as any, () => api.get('/me')),
            runWithContext({ cookies: user2Cookies } as any, () => api.get('/me'))
        ]);

        // Verify User 1 request
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/me'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer user1-token'
                })
            })
        );

        // Verify User 2 request
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/me'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer user2-token'
                })
            })
        );
    });

    it('should handle independent token refreshes for different users', async () => {
        const now = Math.floor(Date.now() / 1000);
        
        // User 1: Token EXPIRED, needs refresh
        const user1Cookies = createMockCookies({
            'access_token': 'user1-old-access',
            'refresh_token': 'user1-refresh',
            'access_expires_at': (now - 10).toString()
        });

        // User 2: Token VALID, no refresh needed
        const user2Cookies = createMockCookies({
            'access_token': 'user2-access',
            'refresh_token': 'user2-refresh',
            'access_expires_at': (now + 3600).toString()
        });

        global.fetch = vi.fn().mockImplementation(async (url) => {
            if (url.includes('/auth/token')) {
                return {
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        access_token: 'user1-new-access',
                        refresh_token: 'user1-new-refresh',
                        expires_in: 3600
                    }),
                    headers: new Headers({ 'content-type': 'application/json' }),
                    url: 'https://api.example.com/auth/token',
                };
            }
            return {
                ok: true,
                status: 200,
                json: () => Promise.resolve({ data: 'ok' }),
                headers: new Headers({ 'content-type': 'application/json' }),
                url: 'https://api.example.com/data',
            };
        });

        await Promise.all([
            runWithContext({ cookies: user1Cookies } as any, () => api.get('/data')),
            runWithContext({ cookies: user2Cookies } as any, () => api.get('/data'))
        ]);

        // User 1 should have refreshed
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/auth/token'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('refresh_token=user1-refresh')
            })
        );
        
        // User 1 request uses NEW token
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/data'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer user1-new-access'
                })
            })
        );

        // User 2 request uses ORIGINAL token
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/data'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer user2-access'
                })
            })
        );
        
        expect((global.fetch as any).mock.calls.filter((c: any) => c[0].includes('/auth/token')).length).toBe(1);
    });
});

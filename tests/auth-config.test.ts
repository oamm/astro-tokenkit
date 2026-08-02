import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext } from '../src';
import type { APIContext } from 'astro';

describe('AuthConfig enhancements', () => {
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

    it('should support form-urlencoded login with extra data and headers', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                contentType: 'application/x-www-form-urlencoded',
                headers: {
                    'x-tenant-name': 'lynx'
                },
                loginData: {
                    grant_type: 'password',
                    client_id: 'lynx',
                    client_secret: 'lynx-secret',
                    scope: 'offline_access'
                }
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ 
                access_token: 'abc', 
                refresh_token: 'def', 
                expires_in: 3600 
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'SuperAdmin', password: 'password123' })
        );

        expect(fetchMock).toHaveBeenCalled();
        const [url, options] = fetchMock.mock.calls[0];
        
        expect(url).toBe('https://api.example.com/auth/token');
        expect(options.method).toBe('POST');
        expect(options.headers).toMatchObject({
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-tenant-name': 'lynx'
        });

        const body = new URLSearchParams(options.body);
        expect(body.get('username')).toBe('SuperAdmin');
        expect(body.get('password')).toBe('password123');
        expect(body.get('grant_type')).toBe('password');
        expect(body.get('client_id')).toBe('lynx');
        expect(body.get('client_secret')).toBe('lynx-secret');
        expect(body.get('scope')).toBe('offline_access');
    });

    it('should support configured and per-request login query params', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/auth/token?existing=true',
                refresh: '/auth/token',
                loginParams: {
                    client: 'web',
                    default_duration: 15,
                },
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'abc',
                refresh_token: 'def',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, () =>
            client.login({ username: 'SuperAdmin', password: 'password123' }, {
                params: {
                    token_duration_minutes: 30,
                    default_duration: 30,
                },
            })
        );

        const [url] = fetchMock.mock.calls[0];
        const requestUrl = new URL(url);

        expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.example.com/auth/token');
        expect(requestUrl.searchParams.get('existing')).toBe('true');
        expect(requestUrl.searchParams.get('client')).toBe('web');
        expect(requestUrl.searchParams.get('default_duration')).toBe('30');
        expect(requestUrl.searchParams.get('token_duration_minutes')).toBe('30');
    });

    it('should pass client configured headers to login requests', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            headers: {
                'x-app-name': 'portal',
                'x-tenant-name': 'default',
            },
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                headers: {
                    'x-tenant-name': 'lynx',
                },
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'abc',
                refresh_token: 'def',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, () =>
            client.login({ username: 'SuperAdmin', password: 'password123' }, {
                headers: {
                    'x-request-id': 'login-1',
                },
            })
        );

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toMatchObject({
            'x-app-name': 'portal',
            'x-tenant-name': 'lynx',
            'x-request-id': 'login-1',
        });
    });

    it('should resolve dynamic headers for login requests from the current context', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            resolveHeaders: (ctx, { operation }) => {
                const tenant = ctx.request.headers.get('x-tenant-name');
                return tenant ? { 'x-tenant-name': `${operation}:${tenant}` } : {};
            },
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'abc',
                refresh_token: 'def',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({
            cookies: mockAstro.cookies,
            request: new Request('http://localhost', {
                headers: { 'x-tenant-name': 'lynx' },
            }),
        } as any, () => client.login({ username: 'SuperAdmin', password: 'password123' }));

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toMatchObject({
            'x-tenant-name': 'login:lynx',
        });
    });

    it('should resolve dynamic headers for regular API requests from the current context', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            headers: {
                'x-app-name': 'portal',
            },
            resolveHeaders: (ctx, { operation, request }) => {
                const tenant = ctx.request.headers.get('x-tenant-name');
                return tenant ? {
                    'x-tenant-name': `${operation}:${request?.method}:${tenant}`,
                    'x-request-source': 'resolver',
                } : {};
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            url: 'https://api.example.com/widgets',
            json: () => Promise.resolve({ ok: true }),
        });
        global.fetch = fetchMock;

        await runWithContext({
            cookies: mockAstro.cookies,
            request: new Request('http://localhost', {
                headers: { 'x-tenant-name': 'lynx' },
            }),
        } as any, () => client.get('/widgets', {
            headers: {
                'x-request-source': 'request',
            },
        }));

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toMatchObject({
            'x-app-name': 'portal',
            'x-tenant-name': 'request:GET:lynx',
            'x-request-source': 'request',
        });
    });

    it('should support form-urlencoded refresh with extra data and headers', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                contentType: 'application/x-www-form-urlencoded',
                refreshRequestField: 'refresh_token',
                headers: {
                    'x-tenant-name': 'lynx'
                },
                refreshData: {
                    grant_type: 'refresh_token',
                    client_id: 'lynx',
                    client_secret: 'lynx-secret'
                }
            },
        });

        // Setup existing tokens
        mockAstro.cookies.get = vi.fn().mockImplementation((name) => {
            if (name === 'access_token') return { value: 'old-at' };
            if (name === 'refresh_token') return { value: 'old-rt' };
            if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) - 100).toString() }; // expired
            return undefined;
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ 
                access_token: 'new-at', 
                refresh_token: 'new-rt', 
                expires_in: 3600 
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
            // Need to trigger ensure() which performRefresh calls
            const session = await client.tokenManager?.ensure({ cookies: mockAstro.cookies } as any);
            expect(session?.accessToken).toBe('new-at');
        });

        expect(fetchMock).toHaveBeenCalled();
        const [url, options] = fetchMock.mock.calls[0];
        
        expect(url).toBe('https://api.example.com/auth/token');
        expect(options.headers).toMatchObject({
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-tenant-name': 'lynx'
        });

        const body = new URLSearchParams(options.body);
        expect(body.get('refresh_token')).toBe('old-rt');
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('client_id')).toBe('lynx');
        expect(body.get('client_secret')).toBe('lynx-secret');
    });

    it('should pass client configured headers to refresh requests', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            headers: {
                'x-app-name': 'portal',
                'x-tenant-name': 'default',
            },
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                headers: {
                    'x-tenant-name': 'lynx',
                },
            },
        });

        mockAstro.cookies.get = vi.fn().mockImplementation((name) => {
            if (name === 'access_token') return { value: 'old-at' };
            if (name === 'refresh_token') return { value: 'old-rt' };
            if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) - 100).toString() };
            return undefined;
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'new-at',
                refresh_token: 'new-rt',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
            const session = await client.tokenManager?.ensure(
                { cookies: mockAstro.cookies } as any,
                undefined,
                { 'x-request-id': 'refresh-1' }
            );
            expect(session?.accessToken).toBe('new-at');
        });

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toMatchObject({
            'x-app-name': 'portal',
            'x-tenant-name': 'lynx',
            'x-request-id': 'refresh-1',
        });
    });

    it('should resolve dynamic headers for refresh requests from the current context', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            resolveHeaders: (ctx, { operation }) => {
                const tenant = ctx.request.headers.get('x-tenant-name');
                return tenant ? { 'x-tenant-name': `${operation}:${tenant}` } : {};
            },
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
            },
        });

        mockAstro.cookies.get = vi.fn().mockImplementation((name) => {
            if (name === 'access_token') return { value: 'old-at' };
            if (name === 'refresh_token') return { value: 'old-rt' };
            if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) - 100).toString() };
            return undefined;
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'new-at',
                refresh_token: 'new-rt',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({
            cookies: mockAstro.cookies,
            request: new Request('http://localhost', {
                headers: { 'x-tenant-name': 'lynx' },
            }),
        } as any, async () => {
            const session = await client.tokenManager?.ensure({
                cookies: mockAstro.cookies,
                request: new Request('http://localhost', {
                    headers: { 'x-tenant-name': 'lynx' },
                }),
            } as any);
            expect(session?.accessToken).toBe('new-at');
        });

        const [, options] = fetchMock.mock.calls[0];

        expect(options.headers).toMatchObject({
            'x-tenant-name': 'refresh:lynx',
        });
    });

    it('should not share concurrent refreshes across different resolved headers', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            resolveHeaders: (ctx) => {
                const tenant = ctx.request.headers.get('x-tenant-name');
                return tenant ? { 'x-tenant-name': tenant } : {};
            },
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
            },
        });

        const now = Math.floor(Date.now() / 1000);
        const createCookies = () => ({
            get: vi.fn().mockImplementation((name) => {
                if (name === 'access_token') return { value: 'old-at' };
                if (name === 'refresh_token') return { value: 'shared-rt' };
                if (name === 'access_expires_at') return { value: (now - 100).toString() };
                return undefined;
            }),
            set: vi.fn(),
            delete: vi.fn(),
        });

        const fetchMock = vi.fn().mockImplementation(async (_url, options) => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: `new-at-${options.headers['x-tenant-name']}`,
                refresh_token: 'new-rt',
                expires_in: 3600,
            }),
        }));
        global.fetch = fetchMock;

        await Promise.all([
            runWithContext({
                cookies: createCookies(),
                request: new Request('http://localhost', {
                    headers: { 'x-tenant-name': 'lynx' },
                }),
            } as any, () => client.tokenManager!.ensure({
                cookies: createCookies(),
                request: new Request('http://localhost', {
                    headers: { 'x-tenant-name': 'lynx' },
                }),
            } as any)),
            runWithContext({
                cookies: createCookies(),
                request: new Request('http://localhost', {
                    headers: { 'x-tenant-name': 'orca' },
                }),
            } as any, () => client.tokenManager!.ensure({
                cookies: createCookies(),
                request: new Request('http://localhost', {
                    headers: { 'x-tenant-name': 'orca' },
                }),
            } as any)),
        ]);

        const tenants = fetchMock.mock.calls.map(([, options]) => options.headers['x-tenant-name']).sort();
        expect(tenants).toEqual(['lynx', 'orca']);
    });

    it('should support configured and per-request refresh query params', async () => {
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/auth/token',
                refresh: '/auth/token',
                refreshParams: {
                    client: 'web',
                },
            },
        });

        mockAstro.cookies.get = vi.fn().mockImplementation((name) => {
            if (name === 'access_token') return { value: 'old-at' };
            if (name === 'refresh_token') return { value: 'old-rt' };
            if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) - 100).toString() };
            return undefined;
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/auth/token',
            json: () => Promise.resolve({
                access_token: 'new-at',
                refresh_token: 'new-rt',
                expires_in: 3600,
            }),
        });
        global.fetch = fetchMock;

        await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
            const session = await client.tokenManager?.ensure(
                { cookies: mockAstro.cookies } as any,
                { params: { token_duration_minutes: 30 } }
            );
            expect(session?.accessToken).toBe('new-at');
        });

        const [url] = fetchMock.mock.calls[0];
        const requestUrl = new URL(url);

        expect(requestUrl.origin + requestUrl.pathname).toBe('https://api.example.com/auth/token');
        expect(requestUrl.searchParams.get('client')).toBe('web');
        expect(requestUrl.searchParams.get('token_duration_minutes')).toBe('30');
    });
});

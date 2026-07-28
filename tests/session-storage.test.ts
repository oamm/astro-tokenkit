import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError, createClient, runWithContext } from '../src';

function createSessionContext(initial: Record<string, any> = {}) {
    const store = new Map(Object.entries(initial));

    return {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        session: {
            get: vi.fn(async (key: string) => store.get(key)),
            set: vi.fn((key: string, value: any) => {
                store.set(key, value);
            }),
            delete: vi.fn((key: string) => {
                store.delete(key);
            }),
        },
        store,
    };
}

function createDestroyableSessionContext(initial: Record<string, any> = {}) {
    const ctx = createSessionContext(initial);

    return {
        ...ctx,
        session: {
            ...ctx.session,
            destroy: vi.fn(() => {
                ctx.store.clear();
            }),
        },
    };
}

describe('session token storage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores login tokens in the session instead of token cookies', async () => {
        const ctx = createSessionContext();
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/login',
            json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
        });

        await runWithContext(ctx as any, () => client.login({ username: 'test' }));

        expect(ctx.cookies.set).not.toHaveBeenCalled();
        expect(ctx.session.set).toHaveBeenCalledWith('tokenkit', expect.objectContaining({
            accessToken: 'at',
            refreshToken: 'rt',
        }), expect.anything());
    });

    it('reads session tokens when injecting Authorization headers', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createSessionContext({
            tokenkit: {
                accessToken: 'session-access',
                refreshToken: 'session-refresh',
                expiresAt: now + 3600,
                lastRefreshAt: now,
            },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            url: 'https://api.example.com/me',
            json: () => Promise.resolve({ ok: true }),
        });
        global.fetch = fetchMock;

        await runWithContext(ctx as any, () => client.get('/me'));

        expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/me', expect.objectContaining({
            headers: expect.objectContaining({
                Authorization: 'Bearer session-access',
            }),
        }));
    });

    it('reads session tokens from getSessionAsync', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createSessionContext({
            tokenkit: {
                accessToken: 'session-access',
                refreshToken: 'session-refresh',
                expiresAt: now + 3600,
                lastRefreshAt: now,
                tokenType: 'Bearer',
            },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        await runWithContext(ctx as any, async () => {
            await expect(client.getSessionAsync()).resolves.toEqual(expect.objectContaining({
                accessToken: 'session-access',
                expiresAt: now + 3600,
                tokenType: 'Bearer',
            }));
        });
    });

    it('does not destroy an empty Astro session when middleware checks for TokenKit auth', async () => {
        const ctx = createDestroyableSessionContext({
            sessionkit: { userId: null },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });
        global.fetch = vi.fn();

        await runWithContext(ctx as any, async () => {
            const session = await client.tokenManager?.ensure(ctx as any);
            expect(session).toBeNull();
        });

        expect(ctx.session.destroy).not.toHaveBeenCalled();
        expect(ctx.session.delete).not.toHaveBeenCalled();
        expect(ctx.store.get('sessionkit')).toEqual({ userId: null });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not destroy an empty Astro session during read-only session checks', async () => {
        const ctx = createDestroyableSessionContext({
            sessionkit: { userId: null },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        await runWithContext(ctx as any, async () => {
            await expect(client.getSessionAsync()).resolves.toBeNull();
        });

        expect(ctx.session.destroy).not.toHaveBeenCalled();
        expect(ctx.session.delete).not.toHaveBeenCalled();
        expect(ctx.store.get('sessionkit')).toEqual({ userId: null });
    });

    it('does not destroy a refreshable Astro session during read-only expired session checks', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createDestroyableSessionContext({
            tokenkit: {
                accessToken: 'expired-access',
                refreshToken: 'refreshable-token',
                expiresAt: now - 60,
                lastRefreshAt: now - 120,
            },
            user: { id: 'user-1' },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        await runWithContext(ctx as any, async () => {
            await expect(client.getSessionAsync()).resolves.toBeNull();
        });

        expect(ctx.session.destroy).not.toHaveBeenCalled();
        expect(ctx.session.delete).not.toHaveBeenCalled();
        expect(ctx.store.get('tokenkit')).toEqual(expect.objectContaining({
            refreshToken: 'refreshable-token',
        }));
        expect(ctx.store.get('user')).toEqual({ id: 'user-1' });
    });

    it('throws a targeted error when getSession is used with session storage', () => {
        const ctx = createSessionContext();
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        runWithContext(ctx as any, () => {
            expect(() => client.getSession()).toThrow('Use getSessionAsync()');
        });
    });

    it('refreshes expired session tokens from getValidSessionAsync', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createSessionContext({
            tokenkit: {
                accessToken: 'old-access',
                refreshToken: 'old-refresh',
                expiresAt: now - 60,
                lastRefreshAt: now - 120,
            },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/refresh',
            json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        });

        await runWithContext(ctx as any, async () => {
            const session = await client.getValidSessionAsync();
            expect(session?.accessToken).toBe('new-access');
        });

        expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/refresh', expect.anything());
        expect(ctx.session.set).toHaveBeenLastCalledWith('tokenkit', expect.objectContaining({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
        }), expect.anything());
    });

    it('refreshes expired session tokens back into the session', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createSessionContext({
            tokenkit: {
                accessToken: 'old-access',
                refreshToken: 'old-refresh',
                expiresAt: now - 60,
                lastRefreshAt: now - 120,
            },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/refresh',
            json: () => Promise.resolve({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        });

        await runWithContext(ctx as any, async () => {
            const session = await client.tokenManager?.ensure(ctx as any);
            expect(session?.accessToken).toBe('new-access');
        });

        expect(ctx.cookies.set).not.toHaveBeenCalled();
        expect(ctx.session.set).toHaveBeenLastCalledWith('tokenkit', expect.objectContaining({
            accessToken: 'new-access',
            refreshToken: 'new-refresh',
        }), expect.anything());
    });

    it('calls onSessionInvalid when session storage cannot provide a refreshable token record', async () => {
        const ctx = createSessionContext({
            tokenkit: {
                accessToken: 'orphan-access',
            },
        });
        const onSessionInvalid = vi.fn(async (_error: AuthError, callbackCtx: any) => {
            await callbackCtx.session.delete('tokenkit');
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
                onSessionInvalid,
            },
        });

        await runWithContext(ctx as any, async () => {
            const session = await client.tokenManager?.ensure(ctx as any);
            expect(session).toBeNull();
        });

        expect(onSessionInvalid).toHaveBeenCalledWith(expect.any(AuthError), ctx);
        expect(ctx.session.delete).toHaveBeenCalledWith('tokenkit');
        expect(ctx.store.has('tokenkit')).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('destroys the full Astro session when clearing session storage', async () => {
        const ctx = createDestroyableSessionContext({
            tokenkit: {
                accessToken: 'access',
                refreshToken: 'refresh',
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                lastRefreshAt: Math.floor(Date.now() / 1000),
            },
            user: { id: 'user-1' },
            preferences: { theme: 'dark' },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        await client.tokenManager?.clear(ctx as any);

        expect(ctx.session.destroy).toHaveBeenCalled();
        expect(ctx.session.delete).not.toHaveBeenCalled();
        expect(ctx.store.size).toBe(0);
    });

    it('refreshes an expired session before logout revocation, then destroys the Astro session', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createDestroyableSessionContext({
            tokenkit: {
                accessToken: 'expired-access',
                refreshToken: 'old-refresh',
                expiresAt: now - 60,
                lastRefreshAt: now - 120,
            },
            user: { id: 'user-1' },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                logout: '/logout',
                storage: { type: 'session' },
            },
        });

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Headers(),
                url: 'https://api.example.com/refresh',
                json: () => Promise.resolve({
                    access_token: 'fresh-access',
                    refresh_token: 'fresh-refresh',
                    expires_in: 3600,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
            });

        await runWithContext(ctx as any, async () => {
            await client.logout();
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://api.example.com/refresh', expect.anything());
        expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/logout', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
                Authorization: 'Bearer fresh-access',
            }),
        }));
        expect(ctx.session.destroy).toHaveBeenCalled();
        expect(ctx.store.size).toBe(0);
    });

    it('destroys the full Astro session when refresh token is invalid', async () => {
        const ctx = createDestroyableSessionContext({
            tokenkit: {
                accessToken: 'old-access',
                refreshToken: 'old-refresh',
                expiresAt: Math.floor(Date.now() / 1000) - 60,
                lastRefreshAt: Math.floor(Date.now() / 1000) - 120,
            },
            user: { id: 'user-1' },
        });
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
        });

        await runWithContext(ctx as any, async () => {
            const session = await client.tokenManager?.ensure(ctx as any);
            expect(session).toBeNull();
        });

        expect(ctx.session.destroy).toHaveBeenCalled();
        expect(ctx.store.size).toBe(0);
    });
});

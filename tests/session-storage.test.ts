import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext } from '../src';

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
});

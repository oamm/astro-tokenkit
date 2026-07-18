import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenManager } from '../src/auth/manager';

function createCookieContext(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));

    return {
        cookies: {
            get: vi.fn((name: string) => {
                const value = store.get(name);
                return value ? { value } : undefined;
            }),
            set: vi.fn((name: string, value: string) => {
                store.set(name, value);
            }),
            delete: vi.fn((name: string) => {
                store.delete(name);
            }),
        },
        store,
    };
}

describe('TokenManager token validity', () => {
    const config = {
        login: '/login',
        refresh: '/refresh',
    };

    let manager: TokenManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TokenManager(config, 'https://api.example.com');
    });

    it('clears and returns null when the access token is missing', async () => {
        const now = Math.floor(Date.now() / 1000);
        const syncCtx = createCookieContext({
            refresh_token: 'refresh',
            access_expires_at: String(now + 3600),
        });
        const asyncCtx = createCookieContext({
            refresh_token: 'refresh',
            access_expires_at: String(now + 3600),
        });

        expect(manager.getSession(syncCtx as any)).toBeNull();
        await expect(manager.getSessionAsync(asyncCtx as any)).resolves.toBeNull();

        expect(syncCtx.store.size).toBe(0);
        expect(asyncCtx.store.size).toBe(0);
        expect(syncCtx.cookies.delete).toHaveBeenCalledWith('refresh_token', expect.anything());
        expect(asyncCtx.cookies.delete).toHaveBeenCalledWith('refresh_token', expect.anything());
    });

    it('clears and returns null when the refresh token is missing', async () => {
        const now = Math.floor(Date.now() / 1000);
        const syncCtx = createCookieContext({
            access_token: 'access',
            access_expires_at: String(now + 3600),
        });
        const asyncCtx = createCookieContext({
            access_token: 'access',
            access_expires_at: String(now + 3600),
        });

        expect(manager.getSession(syncCtx as any)).toBeNull();
        await expect(manager.getSessionAsync(asyncCtx as any)).resolves.toBeNull();

        expect(syncCtx.store.size).toBe(0);
        expect(asyncCtx.store.size).toBe(0);
        expect(syncCtx.cookies.delete).toHaveBeenCalledWith('access_token', expect.anything());
        expect(asyncCtx.cookies.delete).toHaveBeenCalledWith('access_token', expect.anything());
    });

    it('refreshes when only the refresh token cookie remains', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createCookieContext({
            refresh_token: 'old-refresh',
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/refresh',
            json: () => Promise.resolve({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                expires_in: 3600,
            }),
        });

        const session = await manager.ensure(ctx as any);

        expect(session?.accessToken).toBe('new-access');
        expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/refresh', expect.anything());
        expect(ctx.store.get('access_token')).toBe('new-access');
        expect(ctx.store.get('refresh_token')).toBe('new-refresh');
        expect(Number(ctx.store.get('access_expires_at'))).toBeGreaterThan(now);
        expect(ctx.cookies.delete).not.toHaveBeenCalled();
    });

    it('does not return an expired session from read-only session helpers', async () => {
        const now = Math.floor(Date.now() / 1000);
        const syncCtx = createCookieContext({
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            access_expires_at: String(now - 60),
        });
        const asyncCtx = createCookieContext({
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            access_expires_at: String(now - 60),
        });

        expect(manager.getSession(syncCtx as any)).toBeNull();
        await expect(manager.getSessionAsync(asyncCtx as any)).resolves.toBeNull();

        expect(syncCtx.cookies.delete).toHaveBeenCalledWith('refresh_token', expect.anything());
        expect(asyncCtx.cookies.delete).toHaveBeenCalledWith('refresh_token', expect.anything());
    });

    it('clears stored TokenKit data when expired token refresh fails as invalid', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createCookieContext({
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            access_expires_at: String(now - 60),
            last_refresh_at: String(now - 120),
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
        });

        await expect(manager.ensure(ctx as any)).resolves.toBeNull();

        expect(ctx.store.size).toBe(0);
        expect(ctx.cookies.delete).toHaveBeenCalledWith('access_token', expect.anything());
        expect(ctx.cookies.delete).toHaveBeenCalledWith('refresh_token', expect.anything());
    });

    it('stores and returns the new bundle after successful refresh', async () => {
        const now = Math.floor(Date.now() / 1000);
        const ctx = createCookieContext({
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            access_expires_at: String(now - 60),
            last_refresh_at: String(now - 120),
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            url: 'https://api.example.com/refresh',
            json: () => Promise.resolve({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                expires_in: 3600,
            }),
        });

        const session = await manager.ensure(ctx as any);

        expect(session?.accessToken).toBe('new-access');
        expect(ctx.store.get('access_token')).toBe('new-access');
        expect(ctx.store.get('refresh_token')).toBe('new-refresh');
        expect(Number(ctx.store.get('access_expires_at'))).toBeGreaterThan(now);
        expect(ctx.cookies.delete).not.toHaveBeenCalled();
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idleManagerMock = vi.hoisted(() => vi.fn());

vi.mock('../src/client/idle-manager', () => ({
    IdleManager: idleManagerMock,
}));

describe('client init idle logout', () => {
    beforeEach(() => {
        vi.resetModules();
        idleManagerMock.mockClear();

        (globalThis as any).window = {
            location: {
                href: 'https://app.example.com/dashboard',
                reload: vi.fn(),
            },
        };
        (globalThis as any).document = {
            cookie: '',
        };
        (globalThis as any).fetch = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as any).__TOKENKIT_CONFIG__;
        delete (globalThis as any).window;
        delete (globalThis as any).document;
        delete (globalThis as any).fetch;
    });

    it('marks idle logout and reloads even when no auth logout endpoint is configured', async () => {
        (globalThis as any).__TOKENKIT_CONFIG__ = {
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                storage: { type: 'session' },
            },
            idle: {
                timeout: 60,
            },
        };

        await import('../src/client/tk-client');

        expect(idleManagerMock).toHaveBeenCalledWith(expect.objectContaining({
            timeout: 60,
            onIdle: expect.any(Function),
        }));

        idleManagerMock.mock.calls[0][0].onIdle();

        expect(document.cookie).toContain('_tk_idle_logout=1');
        expect(fetch).not.toHaveBeenCalled();
        expect(window.location.reload).toHaveBeenCalled();
    });

    it('marks idle logout before calling a configured idle handler', async () => {
        const idleHandler = vi.fn(() => {
            expect(document.cookie).toContain('_tk_idle_logout=1');
        });

        (globalThis as any).__TOKENKIT_CONFIG__ = {
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
            idle: {
                timeout: 60,
                onIdle: idleHandler,
                reload: false,
            },
        };

        await import('../src/client/tk-client');

        idleManagerMock.mock.calls[0][0].onIdle();

        expect(idleHandler).toHaveBeenCalled();
        expect(document.cookie).toContain('_tk_idle_logout=1');
        expect(window.location.reload).not.toHaveBeenCalled();
    });

    it('touches Astro middleware on active sessions without refreshing on every activity event', async () => {
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(100_000)
            .mockReturnValueOnce(110_000)
            .mockReturnValueOnce(161_000);

        (globalThis as any).__TOKENKIT_CONFIG__ = {
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
            idle: {
                timeout: 300,
                keepAlive: true,
                keepAliveInterval: 60,
            },
        };

        await import('../src/client/tk-client');

        const onActivity = idleManagerMock.mock.calls[0][0].onActivity;
        onActivity();
        onActivity();
        onActivity();

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenNthCalledWith(1, 'https://app.example.com/dashboard?_tk_keepalive=100000', {
            method: 'HEAD',
            credentials: 'include',
            cache: 'no-store',
        });
        expect(fetch).toHaveBeenNthCalledWith(2, 'https://app.example.com/dashboard?_tk_keepalive=161000', {
            method: 'HEAD',
            credentials: 'include',
            cache: 'no-store',
        });
    });

    it('does not touch Astro middleware on activity unless keepalive is enabled', async () => {
        (globalThis as any).__TOKENKIT_CONFIG__ = {
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
            idle: {
                timeout: 300,
            },
        };

        await import('../src/client/tk-client');

        idleManagerMock.mock.calls[0][0].onActivity();

        expect(fetch).not.toHaveBeenCalled();
    });
});

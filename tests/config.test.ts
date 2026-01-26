import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setConfig, getConfig, setTokenManager } from '../src/config';
import { createMiddleware } from '../src/middleware';

describe('Global Configuration', () => {
    beforeEach(() => {
        // Reset config
        setConfig({
            loginPath: '/login',
            protect: [],
            access: {
                getRole: (session: any) => session?.payload?.role ?? null,
                getPermissions: (session: any) => session?.payload?.permissions ?? [],
                check: undefined,
            },
            auth: undefined,
            baseURL: '',
        });
        setTokenManager(undefined);
    });

    it('should set and get configuration', () => {
        setConfig({
            loginPath: '/custom-login',
            protect: [{ pattern: '/admin' }]
        });

        const config = getConfig();
        expect(config.loginPath).toBe('/custom-login');
        expect(config.protect).toEqual([{ pattern: '/admin' }]);
    });

    it('should validate loginPath', () => {
        expect(() => setConfig({ loginPath: 'invalid' })).toThrow('Invalid loginPath');
    });

    it('should validate protection rules', () => {
        expect(() => setConfig({ protect: [{ pattern: 'invalid' }] })).toThrow('Invalid pattern');
    });
});

describe('Middleware Protection', () => {
    const mockTokenManager = {
        getSession: vi.fn(),
        ensure: vi.fn(),
    };

    const mockCtx = {
        request: {
            url: 'http://localhost/admin/dashboard',
        },
        redirect: vi.fn(),
    };

    const next = vi.fn().mockResolvedValue('next');

    beforeEach(() => {
        vi.clearAllMocks();
        setTokenManager(mockTokenManager as any);
        setConfig({
            loginPath: '/login',
            protect: [],
            access: {
                check: undefined
            }
        });
    });

    it('should redirect if route is protected and not authenticated', async () => {
        setConfig({
            protect: [{ pattern: '/admin' }],
            loginPath: '/login'
        });

        mockTokenManager.getSession.mockReturnValue(null);

        const middleware = createMiddleware();
        await middleware(mockCtx as any, next);

        expect(mockCtx.redirect).toHaveBeenCalledWith('/login');
        expect(next).not.toHaveBeenCalled();
    });

    it('should allow if route is protected and authenticated', async () => {
        setConfig({
            protect: [{ pattern: '/admin' }],
        });

        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid' });

        const middleware = createMiddleware();
        await middleware(mockCtx as any, next);

        expect(mockCtx.redirect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('should check custom access logic', async () => {
        setConfig({
            protect: [{ pattern: '/admin' }],
            access: {
                check: (session) => session?.payload?.isAdmin === true
            }
        });

        // Not admin
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { isAdmin: false } });
        
        const middleware = createMiddleware();
        await middleware(mockCtx as any, next);
        expect(mockCtx.redirect).toHaveBeenCalledWith('/login');

        // Is admin
        vi.clearAllMocks();
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { isAdmin: true } });
        await middleware(mockCtx as any, next);
        expect(next).toHaveBeenCalled();
    });

    it('should check role in protection rule', async () => {
        setConfig({
            protect: [{ pattern: '/admin', role: 'admin' }],
        });

        const middleware = createMiddleware();

        // Wrong role
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { role: 'user' } });
        await middleware(mockCtx as any, next);
        expect(mockCtx.redirect).toHaveBeenCalledWith('/login');

        // Correct role
        vi.clearAllMocks();
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { role: 'admin' } });
        await middleware(mockCtx as any, next);
        expect(next).toHaveBeenCalled();
    });

    it('should check roles (array) in protection rule', async () => {
        setConfig({
            protect: [{ pattern: '/admin', roles: ['admin', 'super'] }],
        });

        const middleware = createMiddleware();

        // Wrong role
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { role: 'user' } });
        await middleware(mockCtx as any, next);
        expect(mockCtx.redirect).toHaveBeenCalledWith('/login');

        // Correct role (one of)
        vi.clearAllMocks();
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { role: 'super' } });
        await middleware(mockCtx as any, next);
        expect(next).toHaveBeenCalled();
    });

    it('should check permissions in protection rule', async () => {
        setConfig({
            protect: [{ pattern: '/admin', permissions: ['read', 'write'] }],
        });

        const middleware = createMiddleware();

        // Missing one permission
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { permissions: ['read'] } });
        await middleware(mockCtx as any, next);
        expect(mockCtx.redirect).toHaveBeenCalledWith('/login');

        // All permissions present
        vi.clearAllMocks();
        mockTokenManager.getSession.mockReturnValue({ accessToken: 'valid', payload: { permissions: ['read', 'write', 'delete'] } });
        await middleware(mockCtx as any, next);
        expect(next).toHaveBeenCalled();
    });
});

import { describe, it, expect, vi } from 'vitest';
import { autoDetectFields } from '../src/auth/detector';

describe('autoDetectFields with standard OAuth2 response', () => {
    it('should correctly detect fields from the user provided structure', () => {
        const body = {
            "expires_at": 1769535075,
            "access_token": "mock-access-token",
            "token_type": "Bearer",
            "expires_in": 1799,
            "refresh_token": "mock-refresh-token"
        };

        const bundle = autoDetectFields(body);

        expect(bundle.accessToken).toBe('mock-access-token');
        expect(bundle.refreshToken).toBe('mock-refresh-token');
        expect(bundle.accessExpiresAt).toBe(1769535075);
        expect(bundle.tokenType).toBe('Bearer');
    });

    it('should use expires_in if expires_at is missing', () => {
        const body = {
            "access_token": "mock-access-token",
            "token_type": "Bearer",
            "expires_in": 1799,
            "refresh_token": "mock-refresh-token"
        };

        const now = Math.floor(Date.now() / 1000);
        const bundle = autoDetectFields(body);

        expect(bundle.accessToken).toBe('mock-access-token');
        expect(bundle.refreshToken).toBe('mock-refresh-token');
        // Should be approximately now + 1799
        expect(bundle.accessExpiresAt).toBeGreaterThanOrEqual(now + 1799);
        expect(bundle.accessExpiresAt).toBeLessThanOrEqual(now + 1801);
    });

    it('should allow overriding fields via mapping', () => {
        const body = {
            "token": "mapped-access",
            "refresh": "mapped-refresh",
            "exp": 1234567890,
            "type": "JWT"
        };

        const mapping = {
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: 'exp',
            tokenType: 'type'
        };

        const bundle = autoDetectFields(body, mapping);

        expect(bundle.accessToken).toBe('mapped-access');
        expect(bundle.refreshToken).toBe('mapped-refresh');
        expect(bundle.accessExpiresAt).toBe(1234567890);
        expect(bundle.tokenType).toBe('JWT');
    });

    it('should use tokenType in API requests', async () => {
        const { createClient, runWithContext } = await import('../src');
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
        });

        const mockAstro = {
            cookies: {
                get: vi.fn().mockImplementation((name) => {
                    if (name === 'access_token') return { value: 'at' };
                    if (name === 'refresh_token') return { value: 'rt' };
                    if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) + 3600).toString() };
                    if (name === 'token_type') return { value: 'JWT' };
                    return null;
                }),
                set: vi.fn(),
                delete: vi.fn(),
            },
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
        });

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.get('/test')
        );

        expect(global.fetch).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'JWT at'
                })
            })
        );
    });
});

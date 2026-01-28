import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext } from '../src';
import type { APIContext } from 'astro';

describe('Security Fixes', () => {
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

    describe('Token Leakage Protection', () => {
        it('should NOT inject Authorization header for external domains', async () => {
            const client = createClient({
                baseURL: 'https://api.myapp.com',
                auth: {
                    login: '/login',
                    refresh: '/refresh',
                }
            });

            // Mock session
            (mockAstro.cookies.get as any).mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'secret-token' };
                if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) + 3600).toString() };
                return null;
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
                statusText: 'OK',
            });

            await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
                // Internal request - should have token
                await client.get('/me');
                expect(global.fetch).toHaveBeenLastCalledWith(
                    'https://api.myapp.com/me',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'Authorization': 'Bearer secret-token'
                        })
                    })
                );

                // External request - should NOT have token
                await client.get('https://external.com/data');
                expect(global.fetch).toHaveBeenLastCalledWith(
                    'https://external.com/data',
                    expect.objectContaining({
                        headers: expect.not.objectContaining({
                            'Authorization': expect.any(String)
                        })
                    })
                );
            });
        });

        it('should allow relative paths when baseURL is set', async () => {
            const client = createClient({
                baseURL: 'https://api.myapp.com',
                auth: { login: '/login', refresh: '/refresh' }
            });

            (mockAstro.cookies.get as any).mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'secret-token' };
                if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) + 3600).toString() };
                return null;
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
            });

            await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
                await client.get('/relative');
                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.myapp.com/relative',
                    expect.objectContaining({
                        headers: expect.objectContaining({
                            'Authorization': 'Bearer secret-token'
                        })
                    })
                );
            });
        });
    });

    describe('Logout Revocation', () => {
        it('should include Authorization header in logout request', async () => {
            const client = createClient({
                baseURL: 'https://api.myapp.com',
                auth: {
                    login: '/login',
                    refresh: '/refresh',
                    logout: '/logout'
                }
            });

            (mockAstro.cookies.get as any).mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'current-token' };
                if (name === 'access_expires_at') return { value: (Math.floor(Date.now() / 1000) + 3600).toString() };
                return null;
            });

            global.fetch = vi.fn().mockResolvedValue({ ok: true });

            await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
                await client.logout();
                
                expect(global.fetch).toHaveBeenCalledWith(
                    'https://api.myapp.com/logout',
                    expect.objectContaining({
                        method: 'POST',
                        headers: expect.objectContaining({
                            'Authorization': 'Bearer current-token'
                        })
                    })
                );
            });
        });
    });

    describe('Safe URL Joining', () => {
        it('should handle slashes correctly', async () => {
            const client = createClient({
                baseURL: 'https://api.myapp.com/', // Trailing slash
                auth: {
                    login: '/login', // Leading slash
                    refresh: 'refresh', // No leading slash
                }
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
            });

            await runWithContext({ cookies: mockAstro.cookies } as any, async () => {
                await client.login({ user: 'test' });
                expect(global.fetch).toHaveBeenCalledWith('https://api.myapp.com/login', expect.anything());
            });
        });
    });

    describe('JWT UTF-8 Support', () => {
        it('should correctly decode UTF-8 characters in JWT payload', async () => {
            // "{\"sub\":\"1234567890\",\"name\":\"Jūniē\",\"iat\":1516239022}"
            // Base64: eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpcdW5pXHUwMGU5IiwiaWF0IjoxNTE2MjM5MDIyfQ
            // Wait, let's use a simpler one with direct UTF-8
            const payload = { name: 'Jūniē' };
            const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '');
            const token = `header.${base64Payload}.signature`;

            const { parseJWTPayload } = await import('../src/auth/detector');
            const decoded = parseJWTPayload(token);
            
            expect(decoded?.name).toBe('Jūniē');
        });
    });
});

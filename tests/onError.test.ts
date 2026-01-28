import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext, AuthError } from '../src';
import type { APIContext } from 'astro';

describe('APIClient onError callback', () => {
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

    it('should call onError callback after failed login (400 Bad Request)', async () => {
        const onError = vi.fn();
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
        });

        // Mock fetch for failed login
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: () => Promise.resolve({ error: 'invalid_credentials' }),
        });

        try {
            await runWithContext({ cookies: mockAstro.cookies } as any, () => 
                client.login({ username: 'test' }, { onError })
            );
        } catch (error) {
            // Error is expected to be re-thrown
        }

        expect(onError).toHaveBeenCalled();
        const [error, ctx] = onError.mock.calls[0];
        
        expect(error).toBeInstanceOf(AuthError);
        expect(error.status).toBe(400);
        expect(ctx.cookies).toBe(mockAstro.cookies);
    });

    it('should handle async onError callback', async () => {
        let callbackFinished = false;
        const onError = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            callbackFinished = true;
        });

        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
        });

        try {
            await runWithContext({ cookies: mockAstro.cookies } as any, () => 
                client.login({ username: 'test' }, { onError })
            );
        } catch (error) {
            // Expected
        }

        expect(onError).toHaveBeenCalled();
        expect(callbackFinished).toBe(true);
    });

    it('should support traditional Promise behavior with .catch()', async () => {
        const onError = vi.fn();
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
        });

        let catchCalled = false;
        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'test' }, { onError })
                .catch(err => {
                    catchCalled = true;
                    expect(err).toBeInstanceOf(AuthError);
                })
        );

        expect(onError).toHaveBeenCalled();
        expect(catchCalled).toBe(true);
    });
});

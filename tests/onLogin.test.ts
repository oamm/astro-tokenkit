import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src';
import type { APIContext } from 'astro';

describe('APIClient onLogin callback', () => {
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

    it('should call onLogin callback after successful login', async () => {
        const onLogin = vi.fn();
        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                onLogin,
            },
        });

        // Mock fetch for login
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ 
                access_token: 'abc', 
                refresh_token: 'def', 
                expires_in: 3600,
                user: { id: 1, name: 'Test User' }
            }),
        });

        await client.login({ username: 'test' }, { cookies: mockAstro.cookies });

        expect(onLogin).toHaveBeenCalled();
        const [bundle, body, ctx] = onLogin.mock.calls[0];
        
        expect(bundle.accessToken).toBe('abc');
        expect(bundle.refreshToken).toBe('def');
        
        expect(body.user.name).toBe('Test User');
        
        expect(ctx.cookies).toBe(mockAstro.cookies);
    });

    it('should handle async onLogin callback', async () => {
        let callbackFinished = false;
        const onLogin = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            callbackFinished = true;
        });

        const client = createClient({
            baseURL: 'https://api.example.com',
            auth: {
                login: '/login',
                refresh: '/refresh',
                onLogin,
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ 
                access_token: 'abc', 
                refresh_token: 'def', 
                expires_in: 3600 
            }),
        });

        await client.login({ username: 'test' }, { cookies: mockAstro.cookies });

        expect(onLogin).toHaveBeenCalled();
        expect(callbackFinished).toBe(true);
    });
});

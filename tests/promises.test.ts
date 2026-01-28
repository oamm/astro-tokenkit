import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient, runWithContext, APIError, AuthError } from '../src';
import type { APIContext } from 'astro';

describe('Promise behavior (.then, .catch, .finally)', () => {
    const mockAstro = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request('http://localhost'),
    } as unknown as APIContext;

    const client = createClient({
        baseURL: 'https://api.example.com',
        auth: {
            login: '/login',
            refresh: '/refresh',
        },
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should support .then, .catch, .finally on regular requests', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true }),
            url: 'https://api.example.com/test'
        });

        let thenCalled = false;
        let finallyCalled = false;

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.get('/test')
                .then(res => {
                    thenCalled = true;
                    expect(res.data).toEqual({ success: true });
                    expect(res.status).toBe(200);
                })
                .catch(() => {
                    throw new Error('Should not be called');
                })
                .finally(() => {
                    finallyCalled = true;
                })
        );

        expect(thenCalled).toBe(true);
        expect(finallyCalled).toBe(true);
    });

    it('should support .catch and .finally on failed requests', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: 'fail' }),
            url: 'https://api.example.com/test'
        });

        let catchCalled = false;
        let finallyCalled = false;

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.get('/test')
                .then(() => {
                    throw new Error('Should not be called');
                })
                .catch(err => {
                    catchCalled = true;
                    expect(err).toBeInstanceOf(APIError);
                    expect(err.status).toBe(500);
                })
                .finally(() => {
                    finallyCalled = true;
                })
        );

        expect(catchCalled).toBe(true);
        expect(finallyCalled).toBe(true);
    });

    it('should support .then, .catch, .finally on login', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ 
                access_token: 'at', 
                refresh_token: 'rt', 
                expires_in: 3600 
            }),
            url: 'https://api.example.com/login'
        });

        let thenCalled = false;
        let finallyCalled = false;

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'test' })
                .then(res => {
                    thenCalled = true;
                    expect(res.data.accessToken).toBe('at');
                    expect(res.ok).toBe(true);
                })
                .catch(() => {
                    throw new Error('Should not be called');
                })
                .finally(() => {
                    finallyCalled = true;
                })
        );

        expect(thenCalled).toBe(true);
        expect(finallyCalled).toBe(true);
    });

    it('should support .catch and .finally on failed login', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ error: 'unauthorized' }),
            url: 'https://api.example.com/login'
        });

        let catchCalled = false;
        let finallyCalled = false;

        await runWithContext({ cookies: mockAstro.cookies } as any, () => 
            client.login({ username: 'test' })
                .then(() => {
                    throw new Error('Should not be called');
                })
                .catch(err => {
                    catchCalled = true;
                    expect(err).toBeInstanceOf(AuthError);
                    expect(err.status).toBe(401);
                })
                .finally(() => {
                    finallyCalled = true;
                })
        );

        expect(catchCalled).toBe(true);
        expect(finallyCalled).toBe(true);
    });
});

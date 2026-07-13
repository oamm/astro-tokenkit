import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, createClient, setConfig } from '../src';
import { AsyncLocalStorage } from 'node:async_hooks';

describe('Request body and headers for various methods', () => {
    const mockAstro = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request('http://localhost'),
    };

    const als = new AsyncLocalStorage<any>();

    beforeEach(() => {
        vi.clearAllMocks();
        setConfig({
            baseURL: 'https://api.example.com',
            context: als,
            auth: undefined,
            headers: undefined,
        });
    });

    it('should pass globally configured headers into API requests', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        setConfig({
            baseURL: 'https://api.example.com',
            context: als,
            headers: {
                'x-client': 'global',
                'x-shared': 'default',
            },
        });

        await als.run(mockAstro, async () => {
            await api.get('/test', {
                headers: {
                    'x-request': 'request',
                    'x-shared': 'override',
                },
            });
        });

        const [, init] = fetchSpy.mock.calls[0];
        expect(init.headers).toEqual(expect.objectContaining({
            'x-client': 'global',
            'x-request': 'request',
            'x-shared': 'override',
        }));
    });

    it('should pass custom client headers into API requests', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        const client = createClient({
            baseURL: 'https://api.example.com',
            headers: {
                'x-client': 'custom',
            },
        });

        await als.run(mockAstro, async () => {
            await client.get('/test');
        });

        const [, init] = fetchSpy.mock.calls[0];
        expect(init.headers).toEqual(expect.objectContaining({
            'x-client': 'custom',
        }));
    });

    const methodsWithNoBody = ['GET', 'HEAD', 'DELETE'];

    methodsWithNoBody.forEach(method => {
        it(`should NOT send body or Content-Type for ${method} requests even if data is provided`, async () => {
            const fetchSpy = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
                statusText: 'OK',
            });
            global.fetch = fetchSpy;

            await als.run(mockAstro, async () => {
                await api.request({
                    method: method as any,
                    url: '/test',
                    data: { foo: 'bar' }
                });
            });

            const [url, init] = fetchSpy.mock.calls[0];
            expect(init.method).toBe(method);
            expect(init.body).toBeUndefined();
            const headers = init.headers as any;
            expect(headers['Content-Type']).toBeUndefined();
            expect(headers['content-type']).toBeUndefined();
        });

        it(`should NOT send body or Content-Type for lowercase ${method.toLowerCase()} requests`, async () => {
            const fetchSpy = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
                statusText: 'OK',
            });
            global.fetch = fetchSpy;

            await als.run(mockAstro, async () => {
                await api.request({
                    method: method.toLowerCase() as any,
                    url: '/test',
                    data: { foo: 'bar' }
                });
            });

            const [url, init] = fetchSpy.mock.calls[0];
            expect(init.method).toBe(method); // Normalized to uppercase
            expect(init.body).toBeUndefined();
        });
    });

    const methodsWithBody = ['POST', 'PUT', 'PATCH'];

    methodsWithBody.forEach(method => {
        it(`should send body and Content-Type for ${method} requests when data is provided`, async () => {
            const fetchSpy = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
                statusText: 'OK',
            });
            global.fetch = fetchSpy;

            await als.run(mockAstro, async () => {
                await api.request({
                    method: method as any,
                    url: '/test',
                    data: { foo: 'bar' }
                });
            });

            const [url, init] = fetchSpy.mock.calls[0];
            expect(init.method).toBe(method);
            expect(init.body).toBe(JSON.stringify({ foo: 'bar' }));
            const headers = init.headers as any;
            expect(headers['Content-Type']).toBe('application/json');
        });

        it(`should NOT send Content-Type for ${method} requests when NO data is provided`, async () => {
            const fetchSpy = vi.fn().mockResolvedValue({
                ok: true,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ data: 'ok' }),
                status: 200,
                statusText: 'OK',
            });
            global.fetch = fetchSpy;

            await als.run(mockAstro, async () => {
                await api.request({
                    method: method as any,
                    url: '/test'
                });
            });

            const [url, init] = fetchSpy.mock.calls[0];
            expect(init.body).toBeUndefined();
            const headers = init.headers as any;
            expect(headers['Content-Type']).toBeUndefined();
        });
    });
});

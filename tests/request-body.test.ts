import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, setConfig } from '../src';
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
        });
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

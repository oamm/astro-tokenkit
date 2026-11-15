import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, setConfig, TimeoutError } from '../src';
import type { TokenKitContext } from '../src';
const context = { cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } } as unknown as TokenKitContext;
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
function setup(fetchMock = vi.fn()) {
    const client = createClient({ baseURL: 'https://api.test', fetch: fetchMock, retry: false, timeout: false });
    return { client, fetchMock };
}
beforeEach(() =>
    setConfig({
        baseURL: '',
        auth: undefined,
        getContextStore: () => context,
        setContextStore: () => {},
        context: undefined,
        interceptors: undefined,
        headers: undefined,
        resolveHeaders: undefined,
        fetch: undefined
    })
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('authenticated streaming GET', () => {
    it('returns before reading and preserves headers/status without parsing, cloning or buffering', async () => {
        const { client, fetchMock } = setup();
        let pulls = 0;
        const upstream = new Response(
            new ReadableStream(
                {
                    pull(c) {
                        pulls++;
                        c.enqueue(bytes('csv'));
                        c.close();
                    }
                },
                { highWaterMark: 0 }
            ),
            {
                status: 206,
                headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=test.csv' }
            }
        );
        const text = vi.spyOn(upstream, 'text');
        const json = vi.spyOn(upstream, 'json');
        const clone = vi.spyOn(upstream, 'clone');
        fetchMock.mockResolvedValue(upstream);
        const response = await client.stream('/errors.csv', { params: { revision: 3 } });
        expect(pulls).toBe(0);
        expect(response.status).toBe(206);
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.test/errors.csv?revision=3',
            expect.objectContaining({ cache: 'no-store', redirect: 'manual' })
        );
        expect(await response.text()).toBe('csv');
        expect(text).not.toHaveBeenCalled();
        expect(json).not.toHaveBeenCalled();
        expect(clone).not.toHaveBeenCalled();
    });
    it('uses configured headers/resolver/request interceptors and metadata-only streaming interceptors', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('csv'));
        const parsed = vi.fn();
        const streamed = vi.fn();
        const request = vi.fn((c) => ({
            ...c,
            headers: { ...c.headers, 'X-Request': 'yes', 'If-None-Match': 'forbidden' },
            etag: true
        }));
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            timeout: false,
            headers: { 'X-App': 'test' },
            resolveHeaders: () => ({ 'X-Tenant': '101' }),
            interceptors: { request, response: parsed, streamResponse: streamed }
        });
        const response = await client.stream('/csv');
        expect(fetchMock.mock.calls[0][1].headers).toEqual(
            expect.objectContaining({ 'X-App': 'test', 'X-Tenant': '101', 'X-Request': 'yes' })
        );
        expect(new Headers(fetchMock.mock.calls[0][1].headers).has('If-None-Match')).toBe(false);
        expect(parsed).not.toHaveBeenCalled();
        expect(streamed).toHaveBeenCalledOnce();
        expect(streamed.mock.calls[0][0]).not.toHaveProperty('body');
        expect(streamed.mock.calls[0][0].status).toBe(200);
        await response.body?.cancel();
    });
    it('does not read or store ETag response bodies', async () => {
        const cache = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
        const fetchMock = vi
            .fn()
            .mockImplementation(() => Promise.resolve(new Response('csv', { headers: { ETag: 'v1' } })));
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            etagCache: cache,
            timeout: false
        });
        await (await client.stream('/csv')).body?.cancel();
        await (await client.stream('/csv')).body?.cancel();
        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
    });
    it('refreshes a 401 once, cancels discarded bodies and reapplies authorization', async () => {
        const { client, fetchMock } = setup();
        const manager = {
            ensure: vi.fn().mockResolvedValue({ accessToken: 'fresh' }),
            getSessionAsync: vi
                .fn()
                .mockResolvedValueOnce({ accessToken: 'old' })
                .mockResolvedValue({ accessToken: 'fresh' })
        };
        vi.spyOn(client, 'tokenManager', 'get').mockReturnValue(
            manager as unknown as NonNullable<typeof client.tokenManager>
        );
        const cancel = vi.fn();
        fetchMock
            .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: 401 }))
            .mockResolvedValueOnce(new Response('csv'));
        const response = await client.stream('/csv');
        expect(manager.ensure).toHaveBeenCalledWith(context, undefined, undefined, true);
        expect(cancel).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer old');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
        expect(await response.text()).toBe('csv');
    });
    it('never injects the session token into a foreign origin or follows redirects', async () => {
        const { client, fetchMock } = setup();
        const manager = { ensure: vi.fn(), getSessionAsync: vi.fn().mockResolvedValue({ accessToken: 'secret' }) };
        vi.spyOn(client, 'tokenManager', 'get').mockReturnValue(
            manager as unknown as NonNullable<typeof client.tokenManager>
        );
        fetchMock.mockResolvedValue(
            new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } })
        );
        const response = await client.stream('https://foreign.test/csv');
        expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false);
        expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
        expect(response.status).toBe(302);
    });
    it('returns non-2xx bodies untouched after retry policy is exhausted', async () => {
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
        const response = await client.stream('/csv');
        expect(response.status).toBe(403);
        expect(await response.text()).toBe('denied');
    });
    it('retries configured HTTP failures before returning a response and cancels discarded attempts', async () => {
        const cancel = vi.fn();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: 503 }))
            .mockResolvedValueOnce(new Response('ok'));
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            timeout: false,
            retry: { attempts: 2, delay: 0 }
        });
        expect(await (await client.stream('/csv')).text()).toBe('ok');
        expect(cancel).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('supports no-content responses without leaking a timeout', async () => {
        vi.useFakeTimers();
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        const response = await client.stream('/csv', { timeout: 500 });
        expect(response.body).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cancels upstream and releases timeout resources when the consumer cancels', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 })));
        const response = await client.stream('/csv', { timeout: 500 });
        expect(vi.getTimerCount()).toBe(1);
        await response.body?.cancel('stop');
        expect(cancel).toHaveBeenCalledWith('stop');
        expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('keeps the timeout active after headers, fails the body with TimeoutError and never retries', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 })));
        const response = await client.stream('/csv', { timeout: 500 });
        await vi.advanceTimersByTimeAsync(500);
        await expect(response.text()).rejects.toBeInstanceOf(TimeoutError);
        expect(cancel).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('preserves caller cancellation while a timeout is configured, including without body consumption', async () => {
        vi.useFakeTimers();
        const { client, fetchMock } = setup();
        const source = new AbortController();
        const reason = new DOMException('user cancelled', 'AbortError');
        const cancel = vi.fn();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 })));
        const response = await client.stream('/csv', { timeout: 500, signal: source.signal });
        source.abort(reason);
        await expect(response.text()).rejects.toBe(reason);
        expect(cancel).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not retry an already cancelled request or a caller cancellation before headers', async () => {
        const { client, fetchMock } = setup();
        const source = new AbortController();
        source.abort();
        await expect(client.stream('/csv', { signal: source.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('propagates mid-stream errors without restarting the download', async () => {
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(
            new Response(
                new ReadableStream(
                    {
                        pull(c) {
                            c.error(new Error('connection lost'));
                        }
                    },
                    { highWaterMark: 0 }
                )
            )
        );
        await expect((await client.stream('/csv')).text()).rejects.toThrow('connection lost');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe('stream and parsed response lifetime regressions', () => {
    it('honors caller cancellation before headers when a timeout and retries are enabled', async () => {
        vi.useFakeTimers();
        const source = new AbortController();
        const reason = new DOMException('cancelled', 'AbortError');
        const fetchMock = vi
            .fn()
            .mockImplementation(
                (_url, init) =>
                    new Promise((_resolve, reject) =>
                        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
                    )
            );
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            retry: { attempts: 3, delay: 0 }
        });
        const request = client.stream('/csv', { timeout: 500, signal: source.signal });
        const rejected = expect(request).rejects.toBe(reason);
        await vi.advanceTimersByTimeAsync(0);
        source.abort(reason);
        await rejected;
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not retry a transport timeout before headers', async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockImplementation(
                (_url, init) =>
                    new Promise((_resolve, reject) =>
                        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
                    )
            );
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            retry: { attempts: 3, delay: 0 }
        });
        const request = client.stream('/csv', { timeout: 50 });
        const rejected = expect(request).rejects.toBeInstanceOf(TimeoutError);
        await vi.advanceTimersByTimeAsync(50);
        await rejected;
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cancels a retry backoff without starting another request', async () => {
        vi.useFakeTimers();
        const source = new AbortController();
        const fetchMock = vi.fn().mockResolvedValue(new Response('retry', { status: 503 }));
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock,
            timeout: false,
            retry: { attempts: 3, delay: 1000 }
        });
        const request = client.stream('/csv', { signal: source.signal });
        const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
        await vi.advanceTimersByTimeAsync(0);
        source.abort();
        await rejected;
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('returns the final 401 body after one failed authentication retry', async () => {
        const { client, fetchMock } = setup();
        const manager = {
            ensure: vi.fn().mockResolvedValue({ accessToken: 'token' }),
            getSessionAsync: vi.fn().mockResolvedValue({ accessToken: 'token' })
        };
        vi.spyOn(client, 'tokenManager', 'get').mockReturnValue(
            manager as unknown as NonNullable<typeof client.tokenManager>
        );
        const discarded = vi.fn();
        fetchMock
            .mockResolvedValueOnce(
                new Response(new ReadableStream({ cancel: discarded }, { highWaterMark: 0 }), { status: 401 })
            )
            .mockResolvedValueOnce(new Response('denied', { status: 401 }));
        const response = await client.stream('/csv');
        expect(response.status).toBe(401);
        expect(await response.text()).toBe('denied');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(discarded).toHaveBeenCalledOnce();
    });
    it('leaves a 401 body available when session renewal fails', async () => {
        const { client, fetchMock } = setup();
        const manager = { ensure: vi.fn().mockResolvedValue(null), getSessionAsync: vi.fn().mockResolvedValue(null) };
        vi.spyOn(client, 'tokenManager', 'get').mockReturnValue(
            manager as unknown as NonNullable<typeof client.tokenManager>
        );
        fetchMock.mockResolvedValue(new Response('denied', { status: 401 }));
        expect(await (await client.stream('/csv')).text()).toBe('denied');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it('releases the timeout after normal streamed completion', async () => {
        vi.useFakeTimers();
        const { client, fetchMock } = setup();
        fetchMock.mockResolvedValue(new Response('done'));
        const response = await client.stream('/csv', { timeout: 50 });
        expect(await response.text()).toBe('done');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('keeps parsed-body reads within the request timeout', async () => {
        vi.useFakeTimers();
        const { client, fetchMock } = setup();
        const cancel = vi.fn();
        fetchMock.mockImplementation((_url, init) => {
            const body = new ReadableStream({
                start(c) {
                    init.signal.addEventListener(
                        'abort',
                        () => {
                            cancel();
                            c.error(init.signal.reason);
                        },
                        { once: true }
                    );
                }
            });
            return Promise.resolve(new Response(body));
        });
        const request = client.get('/text', { timeout: 50 });
        const rejected = expect(request).rejects.toBeInstanceOf(TimeoutError);
        await vi.advanceTimersByTimeAsync(50);
        await rejected;
        expect(cancel).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('preserves cancellation of parsed responses as caller cancellation, not TimeoutError', async () => {
        vi.useFakeTimers();
        const { client, fetchMock } = setup();
        const source = new AbortController();
        const reason = new DOMException('cancelled', 'AbortError');
        fetchMock.mockImplementation((_url, init) =>
            Promise.resolve(
                new Response(
                    new ReadableStream({
                        start(c) {
                            init.signal.addEventListener('abort', () => c.error(init.signal.reason), { once: true });
                        }
                    })
                )
            )
        );
        const request = client.get('/text', { timeout: 50, signal: source.signal });
        const rejected = expect(request).rejects.toBe(reason);
        await vi.advanceTimersByTimeAsync(0);
        source.abort(reason);
        await rejected;
        expect(vi.getTimerCount()).toBe(0);
    });
});

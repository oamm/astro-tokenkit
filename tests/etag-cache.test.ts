import { describe, expect, it, vi } from 'vitest';
import { createClient, runWithContext } from '../src';

const ctx = { cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } } as any;
const response = (body: any, etag = '"v1"') => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json', etag }),
    json: async () => body,
});

describe('generic ETag cache', () => {
    it('is opt-in, uses consumer keys, replaces entries, and supports policy/invalidation', async () => {
        const entries = new Map<string, any>();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response({ v: 0 }, '"ignored"'))
            .mockResolvedValueOnce(response({ v: 1 }, '"one"'))
            .mockResolvedValueOnce({ ok: false, status: 304, statusText: 'Not Modified', headers: new Headers() });
        const client = createClient({
            baseURL: 'https://api.test',
            fetch: fetchMock as any,
            etagKeyResolver: (url) => new URL(url).pathname,
            etagCache: {
                get: (key) => entries.get(key),
                set: (key, value) => { entries.set(key, value); },
                delete: (key) => { entries.delete(key); },
                clear: () => { entries.clear(); },
            },
            shouldCacheResponse: (_request, result) => result.data.v !== 2,
        });
        await runWithContext(ctx, () => client.get('/items'));
        await runWithContext(ctx, () => client.get('/items', { etag: true }));
        expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('If-None-Match');
        await runWithContext(ctx, () => client.get('/items', { etag: true }));
        expect(fetchMock.mock.calls[2][1].headers).toEqual(expect.objectContaining({ 'If-None-Match': '"one"' }));
        await client.invalidateEtagCache({ key: '/items' });
        expect(entries).toHaveLength(0);
    });

    it('does not add conditional headers to non-GET requests', async () => {
        const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
        const client = createClient({ baseURL: 'https://api.test', fetch: fetchMock as any, etagCache: {
            get: () => ({ etag: '"cached"', body: {} as any }), set: vi.fn(), delete: vi.fn(),
        } });
        await runWithContext(ctx, () => client.post('/items', {}, { headers: { 'If-None-Match': '"caller"' } }));
        expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('If-None-Match');
    });

    it('replaces the cached body and ETag on a later 200 response', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response({ version: 1 }, '"v1"'))
            .mockResolvedValueOnce(response({ version: 2 }, '"v2"'))
            .mockResolvedValueOnce({ ok: false, status: 304, statusText: 'Not Modified', headers: new Headers() });
        const client = createClient({ baseURL: 'https://api.test', fetch: fetchMock as any });
        await runWithContext(ctx, () => client.get('/replace', { etag: true }));
        await runWithContext(ctx, () => client.get('/replace', { etag: true, headers: { 'If-None-Match': '"old"' } }));
        const result = await runWithContext(ctx, () => client.get('/replace', { etag: true }));
        expect(result.data).toEqual({ version: 2 });
        expect(result.headers.get('etag')).toBe('"v2"');
        expect(fetchMock.mock.calls[2][1].headers).toEqual(expect.objectContaining({ 'If-None-Match': '"v2"' }));
    });
});

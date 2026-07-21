import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    api,
    createClient,
    getDocumentMimeType,
    isMultipartFormData,
    MIME_TYPES,
    setConfig,
    shouldSetContentTypeHeader
} from '../src';
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

    it('should send raw octet-stream bodies without JSON serialization', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        const bytes = new Uint8Array([1, 2, 3]);

        await als.run(mockAstro, async () => {
            await api.sendBytes('/binary', bytes, {
                headers: { Accept: 'application/json' },
            });
        });

        const [, init] = fetchSpy.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.body).toBeInstanceOf(Blob);
        expect(await (init.body as Blob).arrayBuffer()).toEqual(bytes.buffer);
        expect(init.headers).toEqual(expect.objectContaining({
            'Content-Type': MIME_TYPES.OCTET_STREAM,
            Accept: 'application/json',
        }));
    });

    it('should expose MIME helpers for document uploads', () => {
        expect(MIME_TYPES.MULTIPART_FORM_DATA).toBe('multipart/form-data');
        expect(MIME_TYPES.OCTET_STREAM).toBe('application/octet-stream');
        expect(getDocumentMimeType('contract.pdf')).toBe(MIME_TYPES.PDF);
        expect(getDocumentMimeType('report.DOCX')).toBe(MIME_TYPES.DOCX);
        expect(getDocumentMimeType('unknown.bin')).toBe(MIME_TYPES.OCTET_STREAM);
        expect(isMultipartFormData('multipart/form-data; boundary=abc')).toBe(true);
        expect(shouldSetContentTypeHeader(MIME_TYPES.MULTIPART_FORM_DATA)).toBe(false);
        expect(shouldSetContentTypeHeader(MIME_TYPES.OCTET_STREAM)).toBe(true);
    });

    it('should not set multipart Content-Type without a boundary for send()', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        const formData = new FormData();
        formData.append('file', new Blob(['raw']), 'document.pdf');

        await als.run(mockAstro, async () => {
            await api.send('/documents', formData, {
                contentType: MIME_TYPES.MULTIPART_FORM_DATA,
            });
        });

        const [, init] = fetchSpy.mock.calls[0];
        expect(init.body).toBe(formData);
        expect(init.headers['Content-Type']).toBeUndefined();
    });

    it('should send caller-provided raw bodies through request()', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ data: 'ok' }),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        const body = new Blob(['raw'], { type: 'application/octet-stream' });

        await als.run(mockAstro, async () => {
            await api.request({
                method: 'POST',
                url: '/raw',
                body,
                headers: { 'Content-Type': 'application/octet-stream' },
            });
        });

        const [, init] = fetchSpy.mock.calls[0];
        expect(init.body).toBe(body);
        expect(init.headers).toEqual(expect.objectContaining({
            'Content-Type': 'application/octet-stream',
        }));
    });

    it('should upload FormData without overriding multipart Content-Type', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([{ id: 1 }]),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        await als.run(mockAstro, async () => {
            await api.uploadFiles('/documents/folder', [
                { file: new Uint8Array([1, 2, 3]), filename: 'IMG_0702.pdf', name: 'Document 1', contentType: MIME_TYPES.PDF },
                { file: new Blob(['b']), filename: 'IMG_0703.jpg', name: 'Image 1' },
            ], {
                params: { batchId: 'batch-1' },
            });
        });

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('https://api.example.com/documents/folder?batchId=batch-1');
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.headers['Content-Type']).toBeUndefined();

        const formData = init.body as FormData;
        expect(formData.get('files[0]')).toBeInstanceOf(Blob);
        expect((formData.get('files[0]') as Blob).type).toBe(MIME_TYPES.PDF);
        expect(formData.get('Name[0]')).toBe('Document 1');
        expect(formData.get('files[1]')).toBeInstanceOf(Blob);
        expect(formData.get('Name[1]')).toBe('Image 1');
    });

    it('should honor explicit upload file contentType for Blob inputs', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([{ id: 1 }]),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        await als.run(mockAstro, async () => {
            await api.uploadFiles('/documents/folder', [
                {
                    file: new Blob(['image-bytes'], { type: MIME_TYPES.OCTET_STREAM }),
                    filename: 'logo.jpg',
                    contentType: MIME_TYPES.JPEG,
                },
            ]);
        });

        const [, init] = fetchSpy.mock.calls[0];
        const formData = init.body as FormData;
        expect((formData.get('files[0]') as Blob).type).toBe(MIME_TYPES.JPEG);
    });

    it('should preserve Blob type when upload file contentType is omitted', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([{ id: 1 }]),
            status: 200,
            statusText: 'OK',
        });
        global.fetch = fetchSpy;

        await als.run(mockAstro, async () => {
            await api.uploadFiles('/documents/folder', [
                {
                    file: new Blob(['image-bytes'], { type: MIME_TYPES.PNG }),
                    filename: 'logo.png',
                },
            ]);
        });

        const [, init] = fetchSpy.mock.calls[0];
        const formData = init.body as FormData;
        expect((formData.get('files[0]') as Blob).type).toBe(MIME_TYPES.PNG);
    });
});

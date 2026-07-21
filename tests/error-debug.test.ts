import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APIClient, APIError, AuthError, MIME_TYPES, NetworkError, runWithContext } from '../src';
import { setConfig } from '../src';

describe('Error Handling and Debug Information', () => {
    const mockCtx = {
        cookies: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        request: new Request('http://localhost'),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        setConfig({
            baseURL: 'https://api.example.com',
        });
    });

    it('should include the raw error as cause in AuthError (login failure)', async () => {
        const client = new APIClient({
            auth: { login: '/login', refresh: '/refresh' }
        });

        const rawError = new Error('Connection refused');
        (rawError as any).code = 'ECONNREFUSED';
        
        global.fetch = vi.fn().mockRejectedValue(rawError);

        try {
            await runWithContext(mockCtx as any, () => client.login({ username: 'test' }));
        } catch (error: any) {
            expect(error).toBeInstanceOf(AuthError);
            expect(error.cause).toBe(rawError);
            expect(error.cause.code).toBe('ECONNREFUSED');
        }
    });

    it('should include the raw error as cause in NetworkError (request failure)', async () => {
        const client = new APIClient();

        const rawError = new Error('DNS Lookup failed');
        (rawError as any).code = 'ENOTFOUND';
        
        global.fetch = vi.fn().mockRejectedValue(rawError);

        try {
            await runWithContext(mockCtx as any, () => client.get('/test'));
        } catch (error: any) {
            expect(error).toBeInstanceOf(NetworkError);
            expect(error.cause).toBe(rawError);
            expect(error.cause.code).toBe('ENOTFOUND');
        }
    });

    it('should support custom fetch implementation', async () => {
        const customFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({ success: true }),
        });

        const client = new APIClient({
            fetch: customFetch as any
        });

        await runWithContext(mockCtx as any, () => client.get('/test'));
        expect(customFetch).toHaveBeenCalled();
    });

    it('should expose sanitized effective headers on upload API errors', async () => {
        expect.assertions(4);

        const client = new APIClient({
            headers: {
                'Content-Type': MIME_TYPES.JSON,
                Accept: MIME_TYPES.JSON,
                Authorization: 'Bearer secret-token',
            },
        });

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 415,
            statusText: 'Unsupported Media Type',
            headers: new Headers(),
            text: () => Promise.resolve(''),
        });

        try {
            await runWithContext(mockCtx as any, () => client.uploadFiles('/documents', [
                {
                    file: new Blob(['image-bytes'], { type: MIME_TYPES.PNG }),
                    filename: 'logo.png',
                },
            ]));
        } catch (error: any) {
            expect(error).toBeInstanceOf(APIError);
            expect(error.request.headers['Content-Type']).toBeUndefined();
            expect(error.request.headers.Accept).toBe(MIME_TYPES.JSON);
            expect(error.request.headers.Authorization).toBe('[redacted]');
        }
    });

    it('should set NODE_TLS_REJECT_UNAUTHORIZED when dangerouslyIgnoreCertificateErrors is true', async () => {
        const originalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        
        try {
            const client = new APIClient({
                dangerouslyIgnoreCertificateErrors: true
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () => Promise.resolve({ success: true }),
            });

            await runWithContext(mockCtx as any, () => client.get('/test'));
            
            expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
        } finally {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalValue;
        }
    });
});

import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { api, setConfig } from '../src';
import type { TokenKitContext } from '../src';

it('delivers native HTTP headers before the server finishes and streams the remaining bytes', async () => {
    let finish: (() => void) | undefined;
    const server = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=test.csv' });
        response.write('header\r\n');
        // Completion is driven by the client after stream() resolves; buffering would deadlock.
        finish = () => response.end('row\r\n');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const context = { cookies: {} } as TokenKitContext;
    setConfig({
        baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        auth: undefined,
        fetch: undefined,
        retry: false,
        getContextStore: () => context,
        setContextStore: () => {}
    });
    try {
        const response = await api.stream('/errors.csv', { timeout: 2000 });
        expect(response.url).toContain('/errors.csv');
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        const reader = response.body!.getReader();
        expect(new TextDecoder().decode((await reader.read()).value)).toBe('header\r\n');
        finish!();
        expect(new TextDecoder().decode((await reader.read()).value)).toBe('row\r\n');
        expect((await reader.read()).done).toBe(true);
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
});

import { bench, describe } from 'vitest';
import { APIClient, runWithContext, createMiddleware } from '../src';
import type { APIContext } from 'astro';

// Setup mock response
const mockResponse = { success: true };
const mockFetch = () => Promise.resolve(new Response(JSON.stringify(mockResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
}));

// Override global fetch
global.fetch = mockFetch as any;

// Initialize clients
const client = new APIClient({
    baseURL: 'https://api.example.com'
});

const clientWithAuth = new APIClient({
    baseURL: 'https://api.example.com',
    auth: {
        login: '/login',
        refresh: '/refresh'
    }
});

// Middleware setup
const middleware = createMiddleware();
const next = () => Promise.resolve(new Response());

// Mock contexts
const mockAstro = {
    cookies: {
        get: () => undefined,
        set: () => {},
        delete: () => {},
    },
    request: new Request('http://localhost'),
} as unknown as APIContext;

const mockAstroWithTokens = {
    cookies: {
        get: (name: string) => {
            if (name === 'tk_access_token') return { value: 'valid-token' };
            if (name === 'tk_refresh_token') return { value: 'valid-refresh' };
            if (name === 'tk_expires_at') return { value: (Date.now() + 3600000).toString() };
            return undefined;
        },
        set: () => {},
        delete: () => {},
    },
    request: new Request('http://localhost'),
} as unknown as APIContext;

const mockAstroWithExpiredTokens = {
    cookies: {
        get: (name: string) => {
            if (name === 'tk_access_token') return { value: 'expired-token' };
            if (name === 'tk_refresh_token') return { value: 'valid-refresh' };
            if (name === 'tk_expires_at') return { value: (Date.now() - 3600000).toString() }; // Expired 1h ago
            return undefined;
        },
        set: () => {},
        delete: () => {},
    },
    request: new Request('http://localhost'),
} as unknown as APIContext;

describe('Library Overhead Benchmark', () => {
    // Baseline
    bench('Native fetch (Baseline)', async () => {
        await fetch('https://api.example.com/test');
    });

    // Impact of runWithContext only
    bench('runWithContext only', async () => {
        await runWithContext(mockAstro, async () => {
            // No-op
        });
    });

    // Middleware overhead
    bench('Middleware overhead', async () => {
        await middleware(mockAstro, next);
    });

    // Plain client request
    bench('APIClient.get (No Auth)', async () => {
        await runWithContext(mockAstro, async () => {
            await client.get('/test');
        });
    });

    // Client request with auth injection
    bench('APIClient.get (With Auth, cached)', async () => {
        await runWithContext(mockAstroWithTokens, async () => {
            await clientWithAuth.get('/test');
        });
    });

    // Client request with refresh triggered
    bench('APIClient.get (With Auth, refresh)', async () => {
        await runWithContext(mockAstroWithExpiredTokens, async () => {
            await clientWithAuth.get('/test');
        });
    });
});

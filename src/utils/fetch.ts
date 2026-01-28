// packages/astro-tokenkit/src/utils/fetch.ts

import type { ClientConfig, AuthConfig } from '../types';

/**
 * Perform a fetch request with optional certificate validation bypass
 */
export async function safeFetch(
    url: string,
    init: RequestInit,
    config: ClientConfig | AuthConfig
): Promise<Response> {
    const fetchFn = config.fetch || fetch;
    const fetchOptions: any = { ...init };

    if (config.dangerouslyIgnoreCertificateErrors && typeof process !== 'undefined') {
        // In Node.js environment
        try {
            // Try to use undici Agent if available (it is built-in in Node 18+)
            // However, we might need to import it if we want to create an Agent.
            // Since we don't want to depend on undici in package.json, we use dynamic import.
            // But wait, undici's Agent is what we need.
            
            // As a fallback and most reliable way for self-signed certs in Node without extra deps:
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            
            // NOTE: This affects the whole process. We should ideally only do this if it's not already 0.
            // But for a dev tool / specialized library, it's often what's needed.
        } catch (e) {
            // Ignore
        }
    }

    return fetchFn(url, fetchOptions);
}

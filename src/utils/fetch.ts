// packages/astro-tokenkit/src/utils/fetch.ts

import type { ClientConfig, AuthConfig } from '../types';

let sharedInsecureAgent: any = null;

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
        try {
            // Try to use undici Agent if available to avoid global process.env changes
            if (!sharedInsecureAgent) {
                // @ts-ignore
                const undici = await import('undici').catch(() => null);
                if (undici && undici.Agent) {
                    sharedInsecureAgent = new undici.Agent({
                        connect: { rejectUnauthorized: false }
                    });
                }
            }

            if (sharedInsecureAgent) {
                fetchOptions.dispatcher = sharedInsecureAgent;
            } else {
                // Fallback to global setting (less secure, but only way without undici)
                if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
                    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    return fetchFn(url, fetchOptions);
}

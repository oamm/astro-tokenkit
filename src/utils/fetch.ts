// packages/astro-tokenkit/src/utils/fetch.ts

import type { ClientConfig, AuthConfig } from '../types';

let sharedInsecureAgent: any = null;
let sharedUndiciFetch: any = null;

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
            // Use undici's fetch with undici's Agent. Mixing an external Agent with
            // Node's built-in fetch can fail when their internal handler contracts differ.
            if (!config.fetch && (!sharedInsecureAgent || !sharedUndiciFetch)) {
                const loadOptionalModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
                const undici = await loadOptionalModule('undici').catch(() => null);
                if (undici && undici.Agent && undici.fetch) {
                    sharedInsecureAgent = new undici.Agent({
                        connect: { rejectUnauthorized: false }
                    });
                    sharedUndiciFetch = undici.fetch;
                }
            }

            if (!config.fetch && sharedInsecureAgent && sharedUndiciFetch) {
                return sharedUndiciFetch(url, {
                    ...fetchOptions,
                    dispatcher: sharedInsecureAgent
                });
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

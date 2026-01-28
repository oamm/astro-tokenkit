// packages/astro-tokenkit/src/integration.ts

import type { AstroIntegration } from 'astro';
import { createMiddleware } from './middleware';
import type { TokenKitConfig } from './types';
import { setConfig } from './config';

/**
 * Astro integration for TokenKit
 * 
 * This integration facilitates the setup of TokenKit in an Astro project.
 * 
 * @example
 * ```ts
 * // astro.config.mjs
 * import { tokenKit } from 'astro-tokenkit';
 * 
 * export default defineConfig({
 *   integrations: [
 *     tokenKit({
 *       baseURL: 'https://api.example.com',
 *       auth: {
 *         login: '/auth/login',
 *         refresh: '/auth/refresh',
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export function tokenKit(config: TokenKitConfig): AstroIntegration {
    setConfig(config);
    
    // Create a serializable version of the config for the runtime
    const serializableConfig = JSON.parse(JSON.stringify(config, (key, value) => {
        if (typeof value === 'function') return undefined;
        return value;
    }));

    return {
        name: 'astro-tokenkit',
        hooks: {
            'astro:config:setup': ({ updateConfig }) => {
                updateConfig({
                    vite: {
                        define: {
                            '__TOKENKIT_CONFIG__': JSON.stringify(serializableConfig)
                        }
                    }
                });
                console.log('[TokenKit] Integration initialized');
            },
        },
    };
}

/**
 * Helper to define middleware in a separate file if needed
 */
export const defineMiddleware = () => createMiddleware();

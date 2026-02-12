// packages/astro-tokenkit/src/integration.ts

import type { AstroIntegration } from 'astro';
import { createMiddleware } from './middleware';
import type { TokenKitConfig } from './types';
import { setConfig } from './config';
import { logger } from './utils/logger';

/**
 * Astro integration for TokenKit
 * 
 * This integration facilitates the setup of TokenKit in an Astro project.
 * It performs the following:
 * - Sets the global configuration for the API client.
 * - Injects the configuration into the client-side via Vite's `define`.
 * - Automatically registers the TokenKit middleware (unless `autoMiddleware` is set to `false`).
 * - Injects a client-side script (`astro-tokenkit/client-init`) to handle idle session monitoring and automatic logout.
 * 
 * @param config - TokenKit configuration options.
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
 *       },
 *       idle: {
 *         timeout: 3600, // 1 hour
 *         alert: { title: 'Session Expired' }
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
            'astro:config:setup': ({ updateConfig, addMiddleware, injectScript }) => {
                updateConfig({
                    vite: {
                        define: {
                            '__TOKENKIT_CONFIG__': JSON.stringify(serializableConfig)
                        }
                    }
                });

                // Autoinject the middleware
                if (config.autoMiddleware !== false) {
                    addMiddleware({
                        entrypoint: 'astro-tokenkit/middleware',
                        order: 'pre'
                    });
                }

                // Always inject the client-side script for idle monitoring
                injectScript('page', `import 'astro-tokenkit/client-init';`);

                logger.debug('[TokenKit] Integration initialized');
            },
        },
    };
}

/**
 * Helper to create the TokenKit middleware.
 * 
 * Use this if you have `autoMiddleware: false` in your integration configuration
 * and want to manually register the middleware in your `src/middleware.ts` file.
 * 
 * @example
 * ```ts
 * // src/middleware.ts
 * import { defineMiddleware } from 'astro-tokenkit';
 * 
 * export const onRequest = defineMiddleware();
 * ```
 */
export const defineMiddleware = () => createMiddleware();

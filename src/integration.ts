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
 *       },
 *       loginPath: '/login',
 *       protect: [
 *         { pattern: '/admin', role: 'admin' },
 *         { pattern: '/dashboard', roles: ['user', 'admin'] },
 *         { pattern: '/settings', permissions: ['settings:write'] }
 *       ]
 *     })
 *   ]
 * });
 * ```
 */
export function tokenKit(config: TokenKitConfig): AstroIntegration {
    setConfig(config);
    return {
        name: 'astro-tokenkit',
        hooks: {
            'astro:config:setup': () => {
                // Future-proofing: could add vite aliases or other setup here
                console.log('[TokenKit] Integration initialized');
            },
        },
    };
}

/**
 * Helper to define middleware in a separate file if needed
 */
export const defineMiddleware = () => createMiddleware();

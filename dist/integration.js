// packages/astro-tokenkit/src/integration.ts
import { createMiddleware } from './middleware';
/**
 * Astro integration for TokenKit
 *
 * This integration facilitates the setup of TokenKit in an Astro project.
 */
export function tokenKit(client) {
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
export const defineMiddleware = (client) => createMiddleware(client);

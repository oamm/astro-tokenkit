// packages/astro-tokenkit/src/config.ts

import type { TokenKitConfig } from "./types";
import { TokenManager } from "./auth/manager";

const CONFIG_KEY = Symbol.for('astro-tokenkit.config');
const MANAGER_KEY = Symbol.for('astro-tokenkit.manager');

const globalStorage = globalThis as any;

/**
 * Internal config with defaults applied
 */
export interface ResolvedConfig extends TokenKitConfig {
    baseURL: string;
}

// Initialize global storage if not present
if (!globalStorage[CONFIG_KEY]) {
    globalStorage[CONFIG_KEY] = {
        runWithContext: undefined,
        getContextStore: undefined,
        setContextStore: undefined,
        baseURL: "",
        debug: false,
    };
}

/**
 * Set configuration
 */
export function setConfig(userConfig: TokenKitConfig): void {
    const currentConfig = globalStorage[CONFIG_KEY];
    const finalConfig = {
        ...currentConfig,
        ...userConfig,
    } as ResolvedConfig;

    // Validate that getter and setter are defined together
    if ((finalConfig.getContextStore && !finalConfig.setContextStore) || 
        (!finalConfig.getContextStore && finalConfig.setContextStore)) {
        throw new Error("[TokenKit] getContextStore and setContextStore must be defined together.");
    }

    globalStorage[CONFIG_KEY] = finalConfig;

    // Re-initialize global token manager if auth changed
    if (finalConfig.auth) {
        const authConfig = {
            ...finalConfig.auth,
            fetch: finalConfig.auth.fetch ?? finalConfig.fetch,
            dangerouslyIgnoreCertificateErrors: finalConfig.auth.dangerouslyIgnoreCertificateErrors ?? finalConfig.dangerouslyIgnoreCertificateErrors,
        };
        globalStorage[MANAGER_KEY] = new TokenManager(authConfig, finalConfig.baseURL);
    } else {
        globalStorage[MANAGER_KEY] = undefined;
    }
}

/**
 * Get current configuration
 */
export function getConfig(): ResolvedConfig {
    return globalStorage[CONFIG_KEY];
}

/**
 * Get global token manager
 */
export function getTokenManager(): TokenManager | undefined {
    return globalStorage[MANAGER_KEY];
}

/**
 * Set global token manager (mainly for testing)
 */
export function setTokenManager(manager: TokenManager | undefined): void {
    globalStorage[MANAGER_KEY] = manager;
}

// Handle injected configuration from Astro integration
try {
    // @ts-ignore
    const injectedConfig = typeof __TOKENKIT_CONFIG__ !== 'undefined' ? __TOKENKIT_CONFIG__ : undefined;
    if (injectedConfig) {
        setConfig(injectedConfig);
    }
} catch (e) {
    // Ignore errors in environments where __TOKENKIT_CONFIG__ might be restricted
}

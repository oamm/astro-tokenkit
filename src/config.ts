// packages/astro-tokenkit/src/config.ts

import type { TokenKitConfig } from "./types";
import { TokenManager } from "./auth/manager";

/**
 * Internal config with defaults applied
 */
export interface ResolvedConfig extends TokenKitConfig {
    baseURL: string;
}

let config: ResolvedConfig = {
    runWithContext: undefined,
    getContextStore: undefined,
    baseURL: "",
};

let tokenManager: TokenManager | undefined;

/**
 * Set configuration
 */
export function setConfig(userConfig: TokenKitConfig): void {
    // Store validated config
    config = {
        ...config,
        ...userConfig,
    } as ResolvedConfig;

    // Re-initialize global token manager if auth changed
    if (config.auth) {
        tokenManager = new TokenManager(config.auth, config.baseURL);
    }
}

/**
 * Get current configuration
 */
export function getConfig(): ResolvedConfig {
    return config;
}

/**
 * Get global token manager
 */
export function getTokenManager(): TokenManager | undefined {
    return tokenManager;
}

/**
 * Set global token manager (mainly for testing)
 */
export function setTokenManager(manager: TokenManager | undefined): void {
    tokenManager = manager;
}

// packages/astro-tokenkit/src/config.ts

import type { TokenKitConfig, ProtectionRule, AccessHooks, Session, TokenKitContext } from "./types";
import { isValidPattern, isValidRedirectPath } from "./validation";
import { TokenManager } from "./auth/manager";

/**
 * Internal config with defaults applied
 */
export interface ResolvedConfig extends TokenKitConfig {
    loginPath: string;
    protect: ProtectionRule[];
    access: Required<AccessHooks>;
    baseURL: string;
}

let config: ResolvedConfig = {
    loginPath: "/login",
    protect: [],
    access: {
        getRole: (session: Session | null) => session?.payload?.role ?? null,
        getPermissions: (session: Session | null) => session?.payload?.permissions ?? [],
        check: undefined as any,
    },
    runWithContext: undefined,
    getContextStore: undefined,
    baseURL: "",
};

let tokenManager: TokenManager | undefined;

/**
 * Set configuration
 */
export function setConfig(userConfig: TokenKitConfig): void {
    // Validate loginPath
    const loginPath = userConfig.loginPath ?? (userConfig.auth?.login || config.loginPath);
    if (!isValidRedirectPath(loginPath)) {
        throw new Error(
            `[TokenKit] Invalid loginPath: "${loginPath}". Must start with / and be less than 500 characters.`
        );
    }

    // Validate protection rules
    if (userConfig.protect) {
        for (const rule of userConfig.protect) {
            // Validate pattern
            if (!isValidPattern(rule.pattern)) {
                throw new Error(
                    `[TokenKit] Invalid pattern: "${rule.pattern}". ` +
                    `Patterns must start with / and be less than 1000 characters.`
                );
            }

            // Validate redirectTo if present
            if (rule.redirectTo && !isValidRedirectPath(rule.redirectTo)) {
                throw new Error(
                    `[TokenKit] Invalid redirectTo: "${rule.redirectTo}". ` +
                    `Must start with / and be less than 500 characters.`
                );
            }
        }
    }

    // Store validated config
    const nextConfig = {
        ...config,
        ...userConfig,
        loginPath,
    };

    if (userConfig.access) {
        nextConfig.access = {
            ...config.access,
            ...userConfig.access,
        };
    }

    config = nextConfig as ResolvedConfig;

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

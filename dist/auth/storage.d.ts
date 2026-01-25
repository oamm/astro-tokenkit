import type { TokenBundle, CookieConfig, TokenKitContext } from '../types';
/**
 * Cookie names
 */
export interface CookieNames {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    lastRefreshAt: string;
}
/**
 * Get cookie names with optional prefix
 */
export declare function getCookieNames(prefix?: string): CookieNames;
/**
 * Get cookie options with smart defaults
 */
export declare function getCookieOptions(config?: CookieConfig): {
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
    httpOnly: boolean;
    domain: string | undefined;
};
/**
 * Store token bundle in cookies
 */
export declare function storeTokens(ctx: TokenKitContext, bundle: TokenBundle, cookieConfig?: CookieConfig): void;
/**
 * Retrieve tokens from cookies
 */
export declare function retrieveTokens(ctx: TokenKitContext, cookieConfig?: CookieConfig): {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    lastRefreshAt: number | null;
};
/**
 * Clear all auth cookies
 */
export declare function clearTokens(ctx: TokenKitContext, cookieConfig?: CookieConfig): void;

// packages/astro-tokenkit/src/auth/storage.ts

import type { AstroGlobal } from 'astro';
import type { TokenBundle, CookieConfig } from '../types';

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
export function getCookieNames(prefix?: string): CookieNames {
    const p = prefix ? `${prefix}_` : '';
    return {
        accessToken: `${p}access_token`,
        refreshToken: `${p}refresh_token`,
        expiresAt: `${p}access_expires_at`,
        lastRefreshAt: `${p}last_refresh_at`,
    };
}

/**
 * Get cookie options with smart defaults
 */
export function getCookieOptions(config: CookieConfig = {}) {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        secure: config.secure ?? isProduction,
        sameSite: config.sameSite ?? 'lax' as const,
        httpOnly: true, // Always HttpOnly for security
        domain: config.domain,
    };
}

/**
 * Store token bundle in cookies
 */
export function storeTokens(
    ctx: AstroGlobal,
    bundle: TokenBundle,
    cookieConfig: CookieConfig = {}
): void {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    const now = Math.floor(Date.now() / 1000);

    // Calculate max age
    const accessMaxAge = Math.max(0, bundle.accessExpiresAt - now);
    const refreshMaxAge = bundle.refreshExpiresAt
        ? Math.max(0, bundle.refreshExpiresAt - now)
        : 7 * 24 * 60 * 60; // Default 7 days

    // Set access token
    ctx.cookies.set(names.accessToken, bundle.accessToken, {
        ...options,
        maxAge: accessMaxAge,
        path: '/',
    });

    // Set refresh token (restricted path for security)
    ctx.cookies.set(names.refreshToken, bundle.refreshToken, {
        ...options,
        maxAge: refreshMaxAge,
        path: '/',
    });

    // Set expiration timestamp
    ctx.cookies.set(names.expiresAt, bundle.accessExpiresAt.toString(), {
        ...options,
        maxAge: accessMaxAge,
        path: '/',
    });

    // Set last refresh timestamp
    ctx.cookies.set(names.lastRefreshAt, now.toString(), {
        ...options,
        maxAge: accessMaxAge,
        path: '/',
    });
}

/**
 * Retrieve tokens from cookies
 */
export function retrieveTokens(
    ctx: AstroGlobal,
    cookieConfig: CookieConfig = {}
): {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    lastRefreshAt: number | null;
} {
    const names = getCookieNames(cookieConfig.prefix);

    const accessToken = ctx.cookies.get(names.accessToken)?.value || null;
    const refreshToken = ctx.cookies.get(names.refreshToken)?.value || null;

    const expiresAtStr = ctx.cookies.get(names.expiresAt)?.value;
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

    const lastRefreshAtStr = ctx.cookies.get(names.lastRefreshAt)?.value;
    const lastRefreshAt = lastRefreshAtStr ? parseInt(lastRefreshAtStr, 10) : null;

    return { accessToken, refreshToken, expiresAt, lastRefreshAt };
}

/**
 * Clear all auth cookies
 */
export function clearTokens(ctx: AstroGlobal, cookieConfig: CookieConfig = {}): void {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);

    ctx.cookies.delete(names.accessToken, { ...options, path: '/' });
    ctx.cookies.delete(names.refreshToken, { ...options, path: '/' });
    ctx.cookies.delete(names.expiresAt, { ...options, path: '/' });
    ctx.cookies.delete(names.lastRefreshAt, { ...options, path: '/' });
}
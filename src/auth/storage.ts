// packages/astro-tokenkit/src/auth/storage.ts

import type {
    TokenBundle,
    CookieConfig,
    TokenKitContext,
    TokenStorageConfig,
    TokenStorageRecord,
    TokenSessionProvider
} from '../types';

type ResolvedTokenSessionProvider = Required<Pick<TokenSessionProvider, 'get' | 'set' | 'delete'>> & Pick<TokenSessionProvider, 'destroy'>;

/**
 * Cookie names
 */
export interface CookieNames {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    lastRefreshAt: string;
    tokenType: string;
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
        tokenType: `${p}token_type`,
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

function getStorageType(storageConfig?: TokenStorageConfig): 'cookie' | 'session' {
    return storageConfig?.type ?? 'cookie';
}

function getSessionKey(cookieConfig: CookieConfig = {}, storageConfig: TokenStorageConfig = {}): string {
    if (storageConfig.key) return storageConfig.key;
    return cookieConfig.prefix ? `${cookieConfig.prefix}_tokenkit` : 'tokenkit';
}

function getSessionProvider(ctx: TokenKitContext, storageConfig: TokenStorageConfig = {}): ResolvedTokenSessionProvider | null {
    const session = storageConfig.provider ?? ctx.session;
    if (!session?.get || !session?.set || !session?.delete) return null;

    return {
        get: (readCtx, key) => storageConfig.provider
            ? session.get(readCtx, key)
            : session.get(key),
        set: (writeCtx, key, value, options) => storageConfig.provider
            ? session.set(writeCtx, key, value, options)
            : session.set(key, value, options),
        delete: (deleteCtx, key) => storageConfig.provider
            ? session.delete(deleteCtx, key)
            : session.delete(key),
        destroy: storageConfig.provider
            ? session.destroy
            : typeof session.destroy === 'function'
                ? (destroyCtx) => destroyCtx.session.destroy()
                : undefined,
    };
}

function bundleToRecord(bundle: TokenBundle, now: number): TokenStorageRecord {
    return {
        accessToken: bundle.accessToken,
        refreshToken: bundle.refreshToken,
        expiresAt: bundle.accessExpiresAt,
        lastRefreshAt: now,
        tokenType: bundle.tokenType,
    };
}

/**
 * Store token bundle in the configured backend
 */
export async function storeTokens(
    ctx: TokenKitContext,
    bundle: TokenBundle,
    cookieConfig: CookieConfig = {},
    storageConfig: TokenStorageConfig = {}
): Promise<void> {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    const now = Math.floor(Date.now() / 1000);

    // Calculate max age
    const refreshMaxAge = bundle.refreshExpiresAt
        ? Math.max(0, bundle.refreshExpiresAt - now)
        : 7 * 24 * 60 * 60; // Default 7 days

    if (getStorageType(storageConfig) === 'session') {
        const provider = getSessionProvider(ctx, storageConfig);
        if (!provider) {
            throw new Error('TokenKit session storage requires Astro ctx.session or a custom storage provider');
        }

        await provider.set(ctx, getSessionKey(cookieConfig, storageConfig), bundleToRecord(bundle, now), {
            ttl: refreshMaxAge,
        });
        return;
    }

    // Keep the access-token metadata until the refresh token expires so server-side
    // navigation can still detect an expired access token and rotate it.
    ctx.cookies.set(names.accessToken, bundle.accessToken, {
        ...options,
        maxAge: refreshMaxAge,
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
        maxAge: refreshMaxAge,
        path: '/',
    });

    // Set last refresh timestamp
    ctx.cookies.set(names.lastRefreshAt, now.toString(), {
        ...options,
        maxAge: refreshMaxAge,
        path: '/',
    });

    // Set token type if available
    if (bundle.tokenType) {
        ctx.cookies.set(names.tokenType, bundle.tokenType, {
            ...options,
            maxAge: refreshMaxAge,
            path: '/',
        });
    }
}

/**
 * Retrieve tokens from the configured backend
 */
export async function retrieveTokens(
    ctx: TokenKitContext,
    cookieConfig: CookieConfig = {},
    storageConfig: TokenStorageConfig = {}
): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    lastRefreshAt: number | null;
    tokenType: string | null;
}> {
    if (getStorageType(storageConfig) === 'session') {
        const provider = getSessionProvider(ctx, storageConfig);
        if (!provider) {
            return { accessToken: null, refreshToken: null, expiresAt: null, lastRefreshAt: null, tokenType: null };
        }

        const record = await provider.get(ctx, getSessionKey(cookieConfig, storageConfig));
        return {
            accessToken: record?.accessToken || null,
            refreshToken: record?.refreshToken || null,
            expiresAt: record?.expiresAt || null,
            lastRefreshAt: record?.lastRefreshAt || null,
            tokenType: record?.tokenType || null,
        };
    }

    return retrieveCookieTokens(ctx, cookieConfig);
}

export function retrieveCookieTokens(
    ctx: TokenKitContext,
    cookieConfig: CookieConfig = {}
): {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    lastRefreshAt: number | null;
    tokenType: string | null;
} {
    const names = getCookieNames(cookieConfig.prefix);

    const accessToken = ctx.cookies.get(names.accessToken)?.value || null;
    const refreshToken = ctx.cookies.get(names.refreshToken)?.value || null;
    const tokenType = ctx.cookies.get(names.tokenType)?.value || null;

    const expiresAtStr = ctx.cookies.get(names.expiresAt)?.value;
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;

    const lastRefreshAtStr = ctx.cookies.get(names.lastRefreshAt)?.value;
    const lastRefreshAt = lastRefreshAtStr ? parseInt(lastRefreshAtStr, 10) : null;

    return { accessToken, refreshToken, expiresAt, lastRefreshAt, tokenType };
}

export function clearCookieTokens(
    ctx: TokenKitContext,
    cookieConfig: CookieConfig = {}
): void {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);

    ctx.cookies.delete(names.accessToken, { ...options, path: '/' });
    ctx.cookies.delete(names.refreshToken, { ...options, path: '/' });
    ctx.cookies.delete(names.expiresAt, { ...options, path: '/' });
    ctx.cookies.delete(names.lastRefreshAt, { ...options, path: '/' });
    ctx.cookies.delete(names.tokenType, { ...options, path: '/' });
}

/**
 * Clear tokens from the configured backend
 */
export async function clearTokens(
    ctx: TokenKitContext,
    cookieConfig: CookieConfig = {},
    storageConfig: TokenStorageConfig = {}
): Promise<void> {
    if (getStorageType(storageConfig) === 'session') {
        const provider = getSessionProvider(ctx, storageConfig);
        if (provider) {
            if (provider.destroy) {
                await provider.destroy(ctx);
            } else if (provider.delete) {
                await provider.delete(ctx, getSessionKey(cookieConfig, storageConfig));
            }
        }
        return;
    }

    clearCookieTokens(ctx, cookieConfig);
}

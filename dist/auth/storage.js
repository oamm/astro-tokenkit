// packages/astro-tokenkit/src/auth/storage.ts
/**
 * Get cookie names with optional prefix
 */
export function getCookieNames(prefix) {
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
export function getCookieOptions(config = {}) {
    var _a, _b;
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        secure: (_a = config.secure) !== null && _a !== void 0 ? _a : isProduction,
        sameSite: (_b = config.sameSite) !== null && _b !== void 0 ? _b : 'lax',
        httpOnly: true, // Always HttpOnly for security
        domain: config.domain,
    };
}
/**
 * Store token bundle in cookies
 */
export function storeTokens(ctx, bundle, cookieConfig = {}) {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    const now = Math.floor(Date.now() / 1000);
    // Calculate max age
    const accessMaxAge = Math.max(0, bundle.accessExpiresAt - now);
    const refreshMaxAge = bundle.refreshExpiresAt
        ? Math.max(0, bundle.refreshExpiresAt - now)
        : 7 * 24 * 60 * 60; // Default 7 days
    // Set access token
    ctx.cookies.set(names.accessToken, bundle.accessToken, Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
    // Set refresh token (restricted path for security)
    ctx.cookies.set(names.refreshToken, bundle.refreshToken, Object.assign(Object.assign({}, options), { maxAge: refreshMaxAge, path: '/' }));
    // Set expiration timestamp
    ctx.cookies.set(names.expiresAt, bundle.accessExpiresAt.toString(), Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
    // Set last refresh timestamp
    ctx.cookies.set(names.lastRefreshAt, now.toString(), Object.assign(Object.assign({}, options), { maxAge: accessMaxAge, path: '/' }));
}
/**
 * Retrieve tokens from cookies
 */
export function retrieveTokens(ctx, cookieConfig = {}) {
    var _a, _b, _c, _d;
    const names = getCookieNames(cookieConfig.prefix);
    const accessToken = ((_a = ctx.cookies.get(names.accessToken)) === null || _a === void 0 ? void 0 : _a.value) || null;
    const refreshToken = ((_b = ctx.cookies.get(names.refreshToken)) === null || _b === void 0 ? void 0 : _b.value) || null;
    const expiresAtStr = (_c = ctx.cookies.get(names.expiresAt)) === null || _c === void 0 ? void 0 : _c.value;
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;
    const lastRefreshAtStr = (_d = ctx.cookies.get(names.lastRefreshAt)) === null || _d === void 0 ? void 0 : _d.value;
    const lastRefreshAt = lastRefreshAtStr ? parseInt(lastRefreshAtStr, 10) : null;
    return { accessToken, refreshToken, expiresAt, lastRefreshAt };
}
/**
 * Clear all auth cookies
 */
export function clearTokens(ctx, cookieConfig = {}) {
    const names = getCookieNames(cookieConfig.prefix);
    const options = getCookieOptions(cookieConfig);
    ctx.cookies.delete(names.accessToken, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.refreshToken, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.expiresAt, Object.assign(Object.assign({}, options), { path: '/' }));
    ctx.cookies.delete(names.lastRefreshAt, Object.assign(Object.assign({}, options), { path: '/' }));
}

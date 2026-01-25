// packages/astro-tokenkit/src/auth/detector.ts
/**
 * Common field names for access tokens
 */
const ACCESS_TOKEN_FIELDS = [
    'access_token',
    'accessToken',
    'token',
    'jwt',
    'id_token',
    'idToken',
];
/**
 * Common field names for refresh tokens
 */
const REFRESH_TOKEN_FIELDS = [
    'refresh_token',
    'refreshToken',
    'refresh',
];
/**
 * Common field names for expiration timestamp
 */
const EXPIRES_AT_FIELDS = [
    'expires_at',
    'expiresAt',
    'exp',
    'expiry',
];
/**
 * Common field names for expires_in (seconds)
 */
const EXPIRES_IN_FIELDS = [
    'expires_in',
    'expiresIn',
    'ttl',
];
/**
 * Common field names for session payload
 */
const SESSION_PAYLOAD_FIELDS = [
    'user',
    'profile',
    'account',
    'data',
];
/**
 * Auto-detect token fields from response body
 */
export function autoDetectFields(body, fieldMapping) {
    // Helper to find field
    const findField = (candidates, mapping) => {
        if (mapping && body[mapping] !== undefined) {
            return body[mapping];
        }
        for (const candidate of candidates) {
            if (body[candidate] !== undefined) {
                return body[candidate];
            }
        }
        return undefined;
    };
    // Detect access token
    const accessToken = findField(ACCESS_TOKEN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.accessToken);
    if (!accessToken) {
        throw new Error(`Could not detect access token field. Tried: ${ACCESS_TOKEN_FIELDS.join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect refresh token
    const refreshToken = findField(REFRESH_TOKEN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.refreshToken);
    if (!refreshToken) {
        throw new Error(`Could not detect refresh token field. Tried: ${REFRESH_TOKEN_FIELDS.join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect expiration
    let accessExpiresAt;
    // Try expires_at first (timestamp)
    const expiresAtValue = findField(EXPIRES_AT_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.expiresAt);
    if (expiresAtValue !== undefined) {
        accessExpiresAt = typeof expiresAtValue === 'number'
            ? expiresAtValue
            : parseInt(expiresAtValue, 10);
    }
    // Try expires_in (seconds from now)
    if (accessExpiresAt === undefined) {
        const expiresInValue = findField(EXPIRES_IN_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.expiresIn);
        if (expiresInValue !== undefined) {
            const expiresIn = typeof expiresInValue === 'number'
                ? expiresInValue
                : parseInt(expiresInValue, 10);
            accessExpiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        }
    }
    if (accessExpiresAt === undefined) {
        throw new Error(`Could not detect expiration field. Tried: ${[...EXPIRES_AT_FIELDS, ...EXPIRES_IN_FIELDS].join(', ')}. ` +
            `Provide custom parseLogin/parseRefresh or field mapping.`);
    }
    // Detect session payload (optional)
    const sessionPayload = findField(SESSION_PAYLOAD_FIELDS, fieldMapping === null || fieldMapping === void 0 ? void 0 : fieldMapping.sessionPayload);
    return {
        accessToken,
        refreshToken,
        accessExpiresAt,
        sessionPayload: sessionPayload || undefined,
    };
}
/**
 * Parse JWT payload without verification (for reading only)
 */
export function parseJWTPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        const payload = parts[1];
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded);
    }
    catch (_a) {
        return null;
    }
}

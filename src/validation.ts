// packages/astro-tokenkit/src/validation.ts

/**
 * Validates if a pattern is a valid path pattern
 */
export function isValidPattern(pattern: string): boolean {
    return (
        typeof pattern === 'string' &&
        pattern.startsWith('/') &&
        pattern.length > 0 &&
        pattern.length < 1000
    );
}

/**
 * Validates if a path is a valid redirect path
 */
export function isValidRedirectPath(path: string): boolean {
    return (
        typeof path === 'string' &&
        path.startsWith('/') &&
        path.length > 0 &&
        path.length < 500
    );
}

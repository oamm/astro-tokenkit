// packages/astro-tokenkit/src/utils/retry.ts
/**
 * Default retry configuration
 */
export const DEFAULT_RETRY = {
    attempts: 3,
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoff: 'exponential',
    delay: 1000,
};
/**
 * Calculate retry delay
 */
export function calculateDelay(attempt, config = {}) {
    const { backoff = DEFAULT_RETRY.backoff, delay = DEFAULT_RETRY.delay } = config;
    if (backoff === 'linear') {
        return delay * attempt;
    }
    // Exponential backoff: delay * 2^(attempt-1)
    return delay * Math.pow(2, attempt - 1);
}
/**
 * Check if error should be retried
 */
export function shouldRetry(status, attempt, config = {}) {
    const { attempts = DEFAULT_RETRY.attempts, statusCodes = DEFAULT_RETRY.statusCodes, } = config;
    if (attempt >= attempts) {
        return false;
    }
    if (status === undefined) {
        // Network errors are retryable
        return true;
    }
    return statusCodes.includes(status);
}
/**
 * Sleep for given milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// packages/astro-tokenkit/src/utils/time.ts
/**
 * Parse time string to seconds
 * Supports: '5m', '30s', '1h', '2d'
 */
export function parseTime(input) {
    if (typeof input === 'number') {
        return input;
    }
    const match = input.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error(`Invalid time format: ${input}. Use format like '5m', '30s', '1h', '2d'`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = {
        s: 1,
        m: 60,
        h: 60 * 60,
        d: 60 * 60 * 24,
    };
    return value * multipliers[unit];
}
/**
 * Format seconds to human-readable string
 */
export function formatTime(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

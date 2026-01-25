/**
 * Parse time string to seconds
 * Supports: '5m', '30s', '1h', '2d'
 */
export declare function parseTime(input: string | number): number;
/**
 * Format seconds to human-readable string
 */
export declare function formatTime(seconds: number): string;

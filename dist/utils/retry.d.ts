import type { RetryConfig } from '../types';
/**
 * Default retry configuration
 */
export declare const DEFAULT_RETRY: Required<RetryConfig>;
/**
 * Calculate retry delay
 */
export declare function calculateDelay(attempt: number, config?: RetryConfig): number;
/**
 * Check if error should be retried
 */
export declare function shouldRetry(status: number | undefined, attempt: number, config?: RetryConfig): boolean;
/**
 * Sleep for given milliseconds
 */
export declare function sleep(ms: number): Promise<void>;

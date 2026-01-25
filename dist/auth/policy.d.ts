import type { RefreshPolicy } from '../types';
/**
 * Default refresh policy
 */
export declare const DEFAULT_POLICY: {
    refreshBefore: number;
    clockSkew: number;
    minInterval: number;
};
/**
 * Normalize refresh policy (convert time strings to seconds)
 */
export declare function normalizePolicy(policy?: RefreshPolicy): Required<RefreshPolicy>;
/**
 * Check if token should be refreshed
 */
export declare function shouldRefresh(expiresAt: number, now: number, lastRefreshAt: number | null, policy?: RefreshPolicy): boolean;
/**
 * Check if token is expired
 */
export declare function isExpired(expiresAt: number, now: number, policy?: RefreshPolicy): boolean;

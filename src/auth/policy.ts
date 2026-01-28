// packages/astro-tokenkit/src/auth/policy.ts

import type { RefreshPolicy } from '../types';
import { parseTime } from '../utils/time';

/**
 * Default refresh policy
 */
export const DEFAULT_POLICY = {
    refreshBefore: 300, // 5 minutes
    clockSkew: 60, // 1 minute
    minInterval: 30, // 30 seconds
};

/**
 * Normalize refresh policy (convert time strings to seconds)
 */
export function normalizePolicy(policy: RefreshPolicy = {}): Required<RefreshPolicy> {
    return {
        refreshBefore: policy.refreshBefore
            ? parseTime(policy.refreshBefore)
            : DEFAULT_POLICY.refreshBefore,
        clockSkew: policy.clockSkew
            ? parseTime(policy.clockSkew)
            : DEFAULT_POLICY.clockSkew,
        minInterval: policy.minInterval
            ? parseTime(policy.minInterval)
            : DEFAULT_POLICY.minInterval,
    };
}

/**
 * Check if token should be refreshed
 */
export function shouldRefresh(
    expiresAt: number,
    now: number,
    lastRefreshAt: number | null,
    policy: RefreshPolicy = {}
): boolean {
    const normalized = normalizePolicy(policy);
    const refreshBefore = typeof normalized.refreshBefore === 'number'
        ? normalized.refreshBefore
        : parseTime(normalized.refreshBefore);
    const clockSkew = typeof normalized.clockSkew === 'number'
        ? normalized.clockSkew
        : parseTime(normalized.clockSkew);
    const minInterval = typeof normalized.minInterval === 'number'
        ? normalized.minInterval
        : parseTime(normalized.minInterval);

    // Adjust for clock skew
    const adjustedNow = now + clockSkew;

    // Check if near expiration
    const timeUntilExpiry = expiresAt - adjustedNow;
    if (timeUntilExpiry > refreshBefore) {
        return false;
    }

    // Check minimum interval
    if (lastRefreshAt !== null) {
        const timeSinceLastRefresh = now - lastRefreshAt;
        if (timeSinceLastRefresh < minInterval) {
            return false;
        }
    }

    return true;
}

/**
 * Check if token is expired
 */
export function isExpired(
    expiresAt: number,
    now: number,
    policy: RefreshPolicy = {}
): boolean {
    const normalized = normalizePolicy(policy);
    const clockSkew = typeof normalized.clockSkew === 'number'
        ? normalized.clockSkew
        : parseTime(normalized.clockSkew);

    // Pessimistic: consider it expired if current time + skew is past expiration
    return now + clockSkew > expiresAt;
}
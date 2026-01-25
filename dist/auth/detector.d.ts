import type { TokenBundle, FieldMapping } from '../types';
/**
 * Auto-detect token fields from response body
 */
export declare function autoDetectFields(body: any, fieldMapping?: FieldMapping): TokenBundle;
/**
 * Parse JWT payload without verification (for reading only)
 */
export declare function parseJWTPayload(token: string): Record<string, any> | null;

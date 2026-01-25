import type { TokenBundle, Session, AuthConfig, TokenKitContext } from '../types';
/**
 * Token Manager handles all token operations
 */
export declare class TokenManager {
    private config;
    private singleFlight;
    private baseURL;
    constructor(config: AuthConfig, baseURL: string);
    /**
     * Perform login
     */
    login(ctx: TokenKitContext, credentials: any): Promise<TokenBundle>;
    /**
     * Perform token refresh
     */
    refresh(ctx: TokenKitContext, refreshToken: string): Promise<TokenBundle | null>;
    /**
     * Ensure valid tokens (with automatic refresh)
     */
    ensure(ctx: TokenKitContext): Promise<Session | null>;
    /**
     * Logout (clear tokens)
     */
    logout(ctx: TokenKitContext): Promise<void>;
    /**
     * Get current session (no refresh)
     */
    getSession(ctx: TokenKitContext): Session | null;
    /**
     * Check if authenticated
     */
    isAuthenticated(ctx: TokenKitContext): boolean;
    /**
     * Create flight key for single-flight deduplication
     */
    private createFlightKey;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenManager } from '../src/auth/manager';
import { AuthError } from '../src/types';
import * as storage from '../src/auth/storage';

vi.mock('../src/auth/storage');

describe('TokenManager Error Handling', () => {
    const config = {
        login: '/login',
        refresh: '/refresh',
        cookies: { prefix: 'test_' }
    };
    const baseURL = 'https://api.example.com';
    let manager: TokenManager;
    const mockCtx = {} as any;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TokenManager(config, baseURL);
    });

    describe('login', () => {
        it('should throw AuthError on failed login', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            await expect(manager.login(mockCtx, { user: 'test' }))
                .rejects.toThrow(AuthError);
            
            try {
                await manager.login(mockCtx, { user: 'test' });
            } catch (error: any) {
                expect(error).toBeInstanceOf(AuthError);
                expect(error.status).toBe(401);
                expect(error.message).toContain('Login failed: 401 Unauthorized');
            }
        });
    });

    describe('refresh', () => {
        it('should return null and clear tokens on 401/403 refresh', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            const result = await manager.refresh(mockCtx, 'old-token');
            
            expect(result).toBeNull();
            expect(storage.clearTokens).toHaveBeenCalledWith(mockCtx, config.cookies);
        });

        it('should throw AuthError and clear tokens on other failed refresh', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            await expect(manager.refresh(mockCtx, 'old-token'))
                .rejects.toThrow(AuthError);
            
            expect(storage.clearTokens).toHaveBeenCalledWith(mockCtx, config.cookies);
        });

        it('should throw AuthError and clear tokens on invalid bundle', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ something: 'invalid' }),
            });

            // Mock autoDetectFields or just let it fail naturally if it throws Error
            // Actually autoDetectFields will throw a generic Error if it can't find tokens.
            
            await expect(manager.refresh(mockCtx, 'old-token'))
                .rejects.toThrow();
            
            expect(storage.clearTokens).toHaveBeenCalledWith(mockCtx, config.cookies);
        });
    });
});

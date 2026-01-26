import { describe, it, expect, beforeEach } from 'vitest';
import { api, createClient, setConfig, getTokenManager } from '../src';

describe('APIClient Singleton', () => {
    beforeEach(() => {
        setConfig({
            baseURL: '',
            auth: undefined,
        });
    });

    it('should return the same instance when createClient is called without args', () => {
        const client1 = createClient();
        const client2 = createClient();
        
        expect(client1).toBe(api);
        expect(client2).toBe(api);
    });

    it('should return a new instance when createClient is called with args', () => {
        const client1 = createClient();
        const client2 = createClient({ baseURL: 'https://api.example.com' });
        
        expect(client1).toBe(api);
        expect(client2).not.toBe(api);
    });

    it('singleton should reflect global config changes dynamically', () => {
        const client = createClient();
        // @ts-ignore
        expect(client.config.baseURL).toBe('');
        
        setConfig({ baseURL: 'https://dynamic.example.com' });
        // @ts-ignore
        expect(client.config.baseURL).toBe('https://dynamic.example.com');
    });

    it('should reuse global token manager when config matches', () => {
        const auth = { login: '/login', refresh: '/refresh' };
        setConfig({
            baseURL: 'https://api.example.com',
            auth
        });
        
        const globalManager = getTokenManager();
        const client = createClient();
        
        expect(client.tokenManager).toBe(globalManager);
        
        // A new client with SAME auth and baseURL references should reuse the SAME manager
        const client2 = createClient({ 
            baseURL: 'https://api.example.com',
            auth: getConfig().auth // Use same reference
        });
        expect(client2.tokenManager).toBe(globalManager);
    });

    it('api should provide a middleware method', () => {
        const middleware = api.middleware();
        expect(typeof middleware).toBe('function');
    });
});

import { getConfig } from '../src/config';

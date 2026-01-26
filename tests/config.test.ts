import {describe, it, expect, beforeEach} from 'vitest';
import {setConfig, getConfig, setTokenManager} from '../src';

describe('Global Configuration', () => {
    beforeEach(() => {
        // Reset config
        setConfig({
            auth: undefined,
            baseURL: '',
        });
        setTokenManager(undefined);
    });

    it('should set and get configuration', () => {
        setConfig({
            baseURL: 'https://api.custom.com',
        });

        const config = getConfig();
        expect(config.baseURL).toBe('https://api.custom.com');
    });
});

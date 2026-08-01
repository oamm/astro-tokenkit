import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/utils/logger';
import { setConfig } from '../src';

describe('logger', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        setConfig({ debug: false });
    });

    it('puts the TokenKit label before the ISO timestamp', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T12:34:56.789Z'));
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        logger.debug('[TokenKit] test message', true, { requestId: 'abc' });

        expect(spy).toHaveBeenCalledWith(
            '[TokenKit] [2026-08-01T12:34:56.789Z] test message',
            { requestId: 'abc' },
        );
    });

    it('keeps scoped TokenKit labels after the ISO timestamp', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T12:34:56.789Z'));
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});

        logger.debug('[TokenKit][refresh] ensure started', true);

        expect(spy).toHaveBeenCalledWith(
            '[TokenKit] [2026-08-01T12:34:56.789Z] [refresh] ensure started',
        );
    });

    it('does not create timestamps for suppressed debug logs', () => {
        vi.useFakeTimers();
        const nowSpy = vi.spyOn(Date.prototype, 'toISOString');
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        setConfig({ debug: false });

        logger.debug('[TokenKit] hidden message');

        expect(debugSpy).not.toHaveBeenCalled();
        expect(nowSpy).not.toHaveBeenCalled();
    });
});

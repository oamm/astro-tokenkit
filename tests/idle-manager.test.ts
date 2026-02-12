import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleManager } from '../src/client/idle-manager';

describe('IdleManager', () => {
    let mockChannel: any;
    let onIdle: any;

    beforeEach(() => {
        vi.useFakeTimers();
        onIdle = vi.fn();
        
        // Mock BroadcastChannel
        mockChannel = {
            postMessage: vi.fn(),
            onmessage: null,
            close: vi.fn(),
        };
        (global as any).BroadcastChannel = vi.fn().mockImplementation(() => mockChannel);

        // Mock localStorage
        const storage: Record<string, string> = {};
        (global as any).localStorage = {
            getItem: vi.fn((key) => storage[key] || null),
            setItem: vi.fn((key, value) => { storage[key] = value; }),
            removeItem: vi.fn((key) => { delete storage[key]; }),
            clear: vi.fn(() => { for (const key in storage) delete storage[key]; }),
        } as any;

        // Mock window and document
        (global as any).requestAnimationFrame = vi.fn().mockImplementation((cb) => {
            return setTimeout(cb, 16);
        });
        (global as any).cancelAnimationFrame = vi.fn().mockImplementation((id) => {
            clearTimeout(id);
        });
        (global as any).window = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        } as any;
        (global as any).CustomEvent = class {
            constructor(type: string, options: any) {
                (this as any).type = type;
                (this as any).detail = options?.detail;
            }
        } as any;
        (global as any).document = {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            visibilityState: 'visible',
        } as any;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        delete (global as any).BroadcastChannel;
        delete (global as any).localStorage;
        delete (global as any).window;
        delete (global as any).document;
        delete (global as any).requestAnimationFrame;
        delete (global as any).cancelAnimationFrame;
    });

    it('should initialize and start checking idle time', () => {
        const manager = new IdleManager({ timeout: 60, onIdle });
        expect((global as any).localStorage.setItem).toHaveBeenCalledWith('_tk_idle_expires', expect.any(String));
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        manager.cleanup();
    });

    it('should trigger onIdle when timeout reached', () => {
        const timeout = 1; // 1 second
        const manager = new IdleManager({ timeout, onIdle });

        // Fast-forward 2 seconds
        vi.advanceTimersByTime(2000);

        expect(onIdle).toHaveBeenCalled();
        expect(mockChannel.postMessage).toHaveBeenCalledWith('logout');
        manager.cleanup();
    });

    it('should reset timer on activity', () => {
        const timeout = 60;
        const manager = new IdleManager({ timeout, onIdle });
        
        // Capture the event handler
        const addEventListenerCalls = vi.mocked((global as any).window.addEventListener).mock.calls;
        const mouseMoveHandler = addEventListenerCalls.find((call: any) => call[0] === 'mousemove')?.[1] as Function;
        
        expect(mouseMoveHandler).toBeDefined();

        const initialExpires = parseInt(vi.mocked((global as any).localStorage.getItem)('_tk_idle_expires') || '0');
        
        // Advance time and report activity
        vi.advanceTimersByTime(10000);
        mouseMoveHandler();

        const newExpires = parseInt(vi.mocked((global as any).localStorage.getItem)('_tk_idle_expires') || '0');
        expect(newExpires).toBeGreaterThan(initialExpires);
        expect(mockChannel.postMessage).toHaveBeenCalledWith('activity');
        manager.cleanup();
    });

    it('should sync activity from other tabs', () => {
        const timeout = 60;
        const manager = new IdleManager({ timeout, onIdle });
        
        const initialExpires = parseInt(vi.mocked((global as any).localStorage.getItem)('_tk_idle_expires') || '0');
        
        vi.advanceTimersByTime(10000);
        
        // Simulate message from other tab
        mockChannel.onmessage({ data: 'activity' });

        const newExpires = parseInt(vi.mocked((global as any).localStorage.getItem)('_tk_idle_expires') || '0');
        expect(newExpires).toBeGreaterThan(initialExpires);
        manager.cleanup();
    });

    it('should logout when receiving logout message from other tab', () => {
        const manager = new IdleManager({ timeout: 60, onIdle });
        
        mockChannel.onmessage({ data: 'logout' });
        
        expect(onIdle).toHaveBeenCalled();
        manager.cleanup();
    });

    it('should dispatch tk:idle event with config in detail', () => {
        const alert = { title: 'Test Alert' };
        const config = { timeout: 1, onIdle, alert };
        const manager = new IdleManager(config);

        vi.advanceTimersByTime(2000);

        expect(window.dispatchEvent).toHaveBeenCalled();
        const call = vi.mocked(window.dispatchEvent).mock.calls.find(c => (c[0] as any).type === 'tk:idle');
        expect(call).toBeDefined();
        expect((call![0] as any).detail).toEqual(config);
        manager.cleanup();
    });
});

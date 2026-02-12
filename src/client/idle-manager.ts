import type { IdleConfig } from '../types';

/**
 * IdleManager handles user inactivity across multiple tabs.
 * It uses BroadcastChannel to synchronize activity and logout events.
 */
export class IdleManager {
    private channel: BroadcastChannel | null = null;
    private timeout: number;
    private onIdle: () => void;
    private activeTabOnly: boolean;
    private rafId: number | null = null;
    private lastCheck = 0;
    private isIdle = false;
    private eventHandler: () => void;
    private config: IdleConfig;
    private isMonitoring = false;
    private lastActivity = 0;
    private expiredTimeKey: string;

    constructor(config: IdleConfig) {
        this.config = config;
        this.timeout = config.timeout;
        this.onIdle = config.onIdle || (() => {});
        this.activeTabOnly = config.activeTabOnly ?? true;
        this.expiredTimeKey = '_tk_idle_expires';
        this.eventHandler = this.reportActivity.bind(this);
        this.isIdle = false;

        if (typeof window === 'undefined') return;

        try {
            this.channel = new BroadcastChannel('tk_idle_channel');
            this.channel.onmessage = (event) => {
                if (event.data === 'activity') {
                    this.updateExpiredTimeLocal();
                } else if (event.data === 'logout') {
                    this.triggerIdle();
                }
            };
        } catch (e) {
            // BroadcastChannel might fail in some environments (e.g. private mode)
        }

        this.start();
    }

    private start() {
        if (typeof window === 'undefined') return;

        this.updateExpiredTimeLocal();
        this.setupEventListeners();
        this.loop();
    }

    private loop() {
        if (this.isIdle) return;

        const now = Date.now();
        // Check every 1 second
        if (now - this.lastCheck >= 1000) {
            const expiredTime = parseInt(localStorage.getItem(this.expiredTimeKey) || '0', 10);
            if (expiredTime > 0 && now > expiredTime) {
                this.handleTimeout();
                return;
            }
            this.lastCheck = now;
        }

        this.rafId = requestAnimationFrame(() => this.loop());
    }

    private setupEventListeners() {
        if (this.activeTabOnly) {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.addTrackers();
                } else {
                    this.removeTrackers();
                }
            });

            if (document.visibilityState === 'visible') {
                this.addTrackers();
            }
        } else {
            this.addTrackers();
        }
    }

    private addTrackers() {
        if (this.isMonitoring) return;
        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        events.forEach(e => window.addEventListener(e, this.eventHandler, { passive: true }));
        this.isMonitoring = true;
    }

    private removeTrackers() {
        if (!this.isMonitoring) return;
        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        events.forEach(e => window.removeEventListener(e, this.eventHandler));
        this.isMonitoring = false;
    }

    private reportActivity() {
        const now = Date.now();
        // Throttle reporting to every 1 second to reduce overhead
        if (now - this.lastActivity < 1000) return;
        
        this.lastActivity = now;
        this.updateExpiredTimeLocal();
        
        if (this.channel) {
            this.channel.postMessage('activity');
        }
    }

    private updateExpiredTimeLocal() {
        const expires = Date.now() + (this.timeout * 1000);
        localStorage.setItem(this.expiredTimeKey, expires.toString());
    }

    private handleTimeout() {
        if (this.isIdle) return;
        if (this.channel) {
            this.channel.postMessage('logout');
        }
        this.triggerIdle();
    }

    private triggerIdle() {
        if (this.isIdle) return;
        this.isIdle = true;

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tk:idle', { detail: this.config }));
        }
        this.cleanup();
        this.onIdle();
    }

    public cleanup() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.removeTrackers();
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        localStorage.removeItem(this.expiredTimeKey);
    }
}

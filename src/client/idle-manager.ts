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
    private navigationHandler: () => void;
    private visibilityHandler: () => void;
    private hasVisibilityListener = false;
    private originalPushState: History['pushState'] | null = null;
    private originalReplaceState: History['replaceState'] | null = null;

    constructor(config: IdleConfig) {
        this.config = config;
        this.timeout = config.timeout;
        this.activeTabOnly = config.activeTabOnly ?? true;
        this.expiredTimeKey = '_tk_idle_expires';
        this.eventHandler = this.reportActivity.bind(this);
        this.navigationHandler = this.handleNavigation.bind(this);
        this.visibilityHandler = this.handleVisibilityChange.bind(this);
        this.isIdle = false;

        const onIdleProp = config.onIdle;
        if (typeof onIdleProp === 'function') {
            this.onIdle = onIdleProp;
        } else if (typeof onIdleProp === 'string') {
            this.onIdle = () => {
                if (typeof window !== 'undefined' && typeof (window as any)[onIdleProp] === 'function') {
                    (window as any)[onIdleProp]();
                }
            };
        } else {
            this.onIdle = () => {};
        }

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

        this.setupNavigationListeners();
        this.resumeMonitoringIfAllowed();
    }

    private resumeMonitoringIfAllowed() {
        if (this.isIdle) return;

        if (this.isExcluded()) {
            this.removeTrackers();
            return;
        }

        this.updateExpiredTimeLocal();
        this.setupEventListeners();
        this.scheduleLoop();
    }

    private loop() {
        if (this.isIdle) return;

        if (this.isExcluded()) {
            this.removeTrackers();
            this.scheduleLoop();
            return;
        }

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

        this.scheduleLoop();
    }

    private scheduleLoop() {
        if (this.rafId !== null || this.isIdle) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.loop();
        });
    }

    private setupEventListeners() {
        if (this.activeTabOnly) {
            if (!this.hasVisibilityListener) {
                document.addEventListener('visibilitychange', this.visibilityHandler);
                this.hasVisibilityListener = true;
            }

            if (document.visibilityState === 'visible') {
                this.addTrackers();
            }
        } else {
            this.addTrackers();
        }
    }

    private setupNavigationListeners() {
        window.addEventListener('popstate', this.navigationHandler);
        window.addEventListener('hashchange', this.navigationHandler);
        window.addEventListener('pageshow', this.navigationHandler);
        document.addEventListener('astro:page-load', this.navigationHandler);
        document.addEventListener('astro:after-swap', this.navigationHandler);

        if (typeof window.history === 'undefined') return;

        this.originalPushState = window.history.pushState;
        this.originalReplaceState = window.history.replaceState;

        const manager = this;
        window.history.pushState = function pushState(...args) {
            const result = manager.originalPushState!.apply(this, args);
            manager.handleNavigation();
            return result;
        };

        window.history.replaceState = function replaceState(...args) {
            const result = manager.originalReplaceState!.apply(this, args);
            manager.handleNavigation();
            return result;
        };
    }

    private removeNavigationListeners() {
        window.removeEventListener('popstate', this.navigationHandler);
        window.removeEventListener('hashchange', this.navigationHandler);
        window.removeEventListener('pageshow', this.navigationHandler);
        document.removeEventListener('astro:page-load', this.navigationHandler);
        document.removeEventListener('astro:after-swap', this.navigationHandler);

        if (typeof window.history !== 'undefined') {
            if (this.originalPushState) {
                window.history.pushState = this.originalPushState;
                this.originalPushState = null;
            }
            if (this.originalReplaceState) {
                window.history.replaceState = this.originalReplaceState;
                this.originalReplaceState = null;
            }
        }
    }

    private handleNavigation() {
        this.lastActivity = 0;
        this.resumeMonitoringIfAllowed();
    }

    private handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            this.addTrackers();
        } else {
            this.removeTrackers();
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

        if (this.isExcluded()) {
            this.updateExpiredTimeLocal();
            return;
        }

        this.isIdle = true;

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tk:idle', { detail: this.config }));
        }
        this.cleanup();
        this.onIdle();
    }

    private isExcluded(): boolean {
        if (this.config.excludePaths && this.config.excludePaths.length > 0) {
            if (typeof window !== 'undefined') {
                const currentPath = window.location.pathname;
                return this.config.excludePaths.some(path => currentPath.startsWith(path));
            }
        }
        return false;
    }

    public cleanup() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.removeTrackers();
        this.removeNavigationListeners();
        if (this.hasVisibilityListener) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.hasVisibilityListener = false;
        }
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        localStorage.removeItem(this.expiredTimeKey);
    }
}

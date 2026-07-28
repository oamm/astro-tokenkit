import { IdleManager } from './idle-manager';

// Global config injected by Vite
declare const __TOKENKIT_CONFIG__: any;

const IDLE_LOGOUT_COOKIE = '_tk_idle_logout';
const DEFAULT_KEEPALIVE_INTERVAL_SECONDS = 60;

let lastKeepAliveAt = 0;

function markIdleLogout() {
    document.cookie = `${IDLE_LOGOUT_COOKIE}=1; Path=/; Max-Age=60; SameSite=Lax`;
}

function callConfiguredIdleHandler(handler: unknown) {
    if (typeof handler === 'function') {
        handler();
        return;
    }

    if (typeof handler === 'string' && typeof (window as any)[handler] === 'function') {
        (window as any)[handler]();
    }
}

function reloadAfterIdle(config: any) {
    if (config.idle.reload !== false) {
        window.location.reload();
    }
}

function touchAstroSession(config: any) {
    if (!config.auth || config.idle.keepAlive !== true) return;

    const interval = Math.max(1, config.idle.keepAliveInterval ?? DEFAULT_KEEPALIVE_INTERVAL_SECONDS) * 1000;
    const now = Date.now();
    if (now - lastKeepAliveAt < interval) return;

    lastKeepAliveAt = now;

    const url = new URL(window.location.href);
    url.searchParams.set('_tk_keepalive', now.toString());

    fetch(url.toString(), {
        method: 'HEAD',
        credentials: 'include',
        cache: 'no-store',
    }).catch(() => {
        // Keepalive is best-effort; the next normal navigation/API call can still refresh.
    });
}

if (typeof window !== 'undefined') {
    const config = typeof __TOKENKIT_CONFIG__ !== 'undefined' ? __TOKENKIT_CONFIG__ : {};
    
    // Initialize Idle Monitoring if configured
    if (config.idle && config.idle.timeout > 0) {
        new IdleManager({
            ...config.idle,
            onActivity: () => touchAstroSession(config),
            onIdle: () => {
                // Mark the browser session for server-side cleanup on the next
                // Astro request, even when no remote logout endpoint is configured.
                if (config.idle.autoLogout !== false && config.auth) {
                    markIdleLogout();

                    callConfiguredIdleHandler(config.idle.onIdle);

                    if (!config.auth.logout) {
                        reloadAfterIdle(config);
                        return;
                    }

                    const logoutURL = config.auth.logout.startsWith('http') 
                        ? config.auth.logout 
                        : (config.baseURL || '') + config.auth.logout;
                    
                    fetch(logoutURL, { 
                        method: 'POST',
                        credentials: 'include'
                    }).finally(() => {
                        reloadAfterIdle(config);
                    });
                    return;
                }

                callConfiguredIdleHandler(config.idle.onIdle);
            }
        });
    }
}

import { IdleManager } from './idle-manager';

// Global config injected by Vite
declare const __TOKENKIT_CONFIG__: any;

const IDLE_LOGOUT_COOKIE = '_tk_idle_logout';

function markIdleLogout() {
    document.cookie = `${IDLE_LOGOUT_COOKIE}=1; Path=/; Max-Age=60; SameSite=Lax`;
}

if (typeof window !== 'undefined') {
    const config = typeof __TOKENKIT_CONFIG__ !== 'undefined' ? __TOKENKIT_CONFIG__ : {};
    
    // Initialize Idle Monitoring if configured
    if (config.idle && config.idle.timeout > 0) {
        new IdleManager({
            ...config.idle,
            onIdle: config.idle.onIdle || (() => {
                // Default implementation: auto logout and reload
                if (config.idle.autoLogout !== false && config.auth?.logout) {
                    markIdleLogout();
                    const logoutURL = config.auth.logout.startsWith('http') 
                        ? config.auth.logout 
                        : (config.baseURL || '') + config.auth.logout;
                    
                    fetch(logoutURL, { 
                        method: 'POST',
                        credentials: 'include'
                    }).finally(() => {
                        if (config.idle.reload !== false) {
                            window.location.reload();
                        }
                    });
                }
            })
        });
    }
}

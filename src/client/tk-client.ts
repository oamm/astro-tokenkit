import { IdleManager } from './idle-manager';

// Global config injected by Vite
declare const __TOKENKIT_CONFIG__: any;

if (typeof window !== 'undefined') {
    const config = typeof __TOKENKIT_CONFIG__ !== 'undefined' ? __TOKENKIT_CONFIG__ : {};
    
    // Initialize Idle Monitoring if configured
    if (config.idle && config.idle.timeout > 0) {
        new IdleManager({
            ...config.idle,
            onIdle: () => {
                // Note: IdleManager dispatches 'tk:idle' automatically
                if (config.idle.autoLogout !== false && config.auth?.logout) {
                    const logoutURL = config.auth.logout.startsWith('http') 
                        ? config.auth.logout 
                        : (config.baseURL || '') + config.auth.logout;
                    
                    fetch(logoutURL, { 
                        method: 'POST', 
                        credentials: 'include' 
                    }).finally(() => {
                        window.location.reload();
                    });
                }
            }
        });
    }
}

import { defineConfig } from 'astro/config';
import { tokenKit } from 'astro-tokenkit';

// https://astro.build/config
export default defineConfig({
  integrations: [
    tokenKit({
      baseURL: 'https://api.example.com',
      auth: {
        login: '/auth/login',
        refresh: '/auth/refresh',
      },
      idle: {
        timeout: 3600, // 1 hour
        alert: { 
            title: 'Session Expired',
            message: 'Your session has timed out due to inactivity.'
        }
      }
    })
  ]
});

# Astro TokenKit

A powerful, type-safe API client for Astro with automatic token rotation, session management, and seamless context integration.

## Features

- **🚀 Built for Astro:** Deep integration with Astro's middleware and context.
- **🔄 Automatic Token Rotation:** Handles access and refresh tokens automatically behind the scenes.
- **🔒 Secure by Default:** Uses HttpOnly cookies for token storage.
- **🧩 Flexible Context:** Supports both internal `AsyncLocalStorage` and external context management.
- **🛠 Type-Safe:** Built with TypeScript for a first-class developer experience.
- **📡 Powerful Interceptors:** Easily add custom logic for requests, responses, and errors.

## Installation

```bash
pnpm add astro-tokenkit
```

## Quick Start

### 1. Add the Integration

Configure TokenKit in your `astro.config.mjs`. This sets the global configuration for the entire app.

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { tokenKit } from 'astro-tokenkit';

export default defineConfig({
  integrations: [
    tokenKit({
      baseURL: 'https://api.yourserver.com',
      auth: {
        login: '/auth/login',
        refresh: '/auth/refresh',
      }
    })
  ],
});
```

### 2. Setup Middleware

Create `src/middleware.ts` to automatically handle context binding and token rotation. You can use the exported `api` singleton's middleware:

```typescript
// src/middleware.ts
import { api } from 'astro-tokenkit';

export const onRequest = api.middleware();
```

### 3. Use in Pages

Now you can use the `api` client anywhere in your Astro pages or components without worrying about passing context.

```astro
---
// src/pages/profile.astro
import { api } from 'astro-tokenkit';

// No need to pass context, it's handled by middleware!
const user = await api.get('/me');
---

<h1>Welcome, {user.name}</h1>
```

### Global Configuration

TokenKit supports a global configuration via the `tokenKit` integration or `setConfig`. All `ClientConfig` properties can be set globally.

```typescript
import { setConfig } from 'astro-tokenkit';

setConfig({
  baseURL: 'https://api.example.com',
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
  }
});
```

### API Singleton

The library exports a global `api` instance that is automatically synchronized with your configuration.

- **Dynamic Sync**: If you update the configuration via `setConfig()`, the `api` instance immediately reflects these changes.
- **Shared Manager**: The `api` instance uses a global `TokenManager` which ensures that token refreshes are synchronized across all requests (preventing race conditions).
- **Middleware Integration**: Use `api.middleware()` for a seamless setup in Astro.

If you need a specialized client with a different configuration, you can still create one:

```typescript
import { createClient } from 'astro-tokenkit';

const specializedClient = createClient({
  baseURL: 'https://another-api.com'
});
```

## Configuration

### Client Configuration

| Property | Type | Description |
| :--- | :--- | :--- |
| `baseURL` | `string` | **Required.** Base URL for all requests. |
| `auth` | `AuthConfig` | Optional authentication configuration. |
| `headers` | `Record<string, string>` | Default headers for all requests. |
| `timeout` | `number` | Request timeout in milliseconds (default: 30000). |
| `retry` | `RetryConfig` | Retry strategy for failed requests. |
| `interceptors`| `InterceptorsConfig` | Request/Response/Error interceptors. |
| `context` | `AsyncLocalStorage` | External AsyncLocalStorage instance. |
| `getContextStore`| `() => TokenKitContext`| Custom method to retrieve the context store. |
| `runWithContext`| `Function`| Custom runner to bind context. |

### Auth Configuration

| Property | Type | Description |
| :--- | :--- | :--- |
| `login` | `string` | Endpoint path for login (POST). |
| `refresh` | `string` | Endpoint path for token refresh (POST). |
| `logout` | `string` | Endpoint path for logout (POST). |
| `fields` | `FieldMapping` | Custom mapping for token fields in API responses. |
| `parseLogin` | `Function` | Custom parser for login response: `(body: any) => TokenBundle`. |
| `parseRefresh`| `Function` | Custom parser for refresh response: `(body: any) => TokenBundle`. |
| `onLogin` | `Function` | Callback after login: `(bundle, body, ctx) => void`. |
| `injectToken` | `Function` | Custom token injection: `(token: string) => string` (default: Bearer). |
| `cookies` | `CookieConfig` | Configuration for auth cookies. |
| `policy` | `RefreshPolicy` | Strategy for when to trigger token refresh. |

## Advanced Usage

### Manual Context

If you prefer not to use middleware, you can pass the Astro context explicitly to any request:

```typescript
const data = await api.get('/data', { ctx: Astro });
```

### Interceptors

```typescript
const api = createClient({
  baseURL: '...',
  interceptors: {
    request: [
      (config, ctx) => {
        config.headers = { ...config.headers, 'X-Custom': 'Value' };
        return config;
      }
    ]
  }
});
```

### Login and Logout

```typescript
// In an API route or server-side component
await api.login({ username, password });

await api.logout();
```

## License

MIT © [oamm](https://github.com/oamm)

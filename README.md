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

### 1. Create your API Client

```typescript
// src/lib/api.ts
import { createClient } from 'astro-tokenkit';

export const api = createClient({
  baseURL: 'https://api.yourserver.com',
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
  }
});
```

### 2. Add the Integration

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { tokenKit } from 'astro-tokenkit';
import { api } from './src/lib/api';

export default defineConfig({
  integrations: [tokenKit(api)],
});
```

### 3. Setup Middleware

```typescript
// src/middleware.ts
import { defineMiddleware } from 'astro-tokenkit';
import { api } from './lib/api';

export const onRequest = defineMiddleware(api);
```

### 4. Use in Pages

```astro
---
// src/pages/profile.astro
import { api } from '../lib/api';

// No need to pass context, it's handled by middleware!
const user = await api.get('/me');
---

<h1>Welcome, {user.name}</h1>
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

### Auth Configuration

| Property | Type | Description |
| :--- | :--- | :--- |
| `login` | `string` | Endpoint path for login (POST). |
| `refresh` | `string` | Endpoint path for token refresh (POST). |
| `logout` | `string` | Endpoint path for logout (POST). |
| `fields` | `FieldMapping` | Custom mapping for token fields in API responses. |
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

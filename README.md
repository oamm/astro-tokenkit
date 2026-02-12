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

// Request methods return an APIResponse object
const { data: user } = await api.get('/me');
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
| `idle` | `IdleConfig` | Inactivity session timeout configuration. |
| `context` | `AsyncLocalStorage` | External AsyncLocalStorage instance. |
| `getContextStore`| `() => TokenKitContext`| Custom method to retrieve the context store. |
| `setContextStore`| `(ctx) => void`| Custom method to set the context store. |
| `runWithContext`| `Function`| Custom runner to bind context. |

### Auth Configuration

| Property | Type | Description |
| :--- | :--- | :--- |
| `login` | `string` | Endpoint path for login (POST). |
| `refresh` | `string` | Endpoint path for token refresh (POST). |
| `logout` | `string` | Endpoint path for logout (POST). |
| `contentType` | `'application/json' \| 'application/x-www-form-urlencoded'` | Content type for auth requests (default: `application/json`). |
| `headers` | `Record<string, string>` | Extra headers for login/refresh requests. |
| `loginData` | `Record<string, any>` | Extra data to be sent with login request. |
| `refreshData` | `Record<string, any>` | Extra data to be sent with refresh request. |
| `refreshRequestField` | `string` | Field name for the refresh token in the refresh request (default: `refreshToken`). |
| `fields` | `FieldMapping` | Custom mapping for token fields in API responses (`accessToken`, `refreshToken`, `expiresAt`, `expiresIn`, `tokenType`, `sessionPayload`). |
| `parseLogin` | `Function` | Custom parser for login response: `(body: any) => TokenBundle`. |
| `parseRefresh`| `Function` | Custom parser for refresh response: `(body: any) => TokenBundle`. |
| `injectToken` | `Function` | Custom token injection: `(token: string, type?: string) => string` (default: Bearer). |
| `cookies` | `CookieConfig` | Configuration for auth cookies. |
| `policy` | `RefreshPolicy` | Strategy for when to trigger token refresh. |

### Idle Session Timeout

Astro TokenKit automatically monitors user inactivity and closes the session across all open tabs. This feature uses `BroadcastChannel` to synchronize activity and logout events.

**Important:** When using the Astro integration, the `onIdle` function cannot be passed in `astro.config.mjs` because it is not serializable. Instead, listen for the `tk:idle` event on the client.

| Property | Type | Description |
| :--- | :--- | :--- |
| `timeout` | `number` | **Required.** Inactivity timeout in seconds. |
| `autoLogout`| `boolean` | Whether to automatically trigger logout by calling the configured logout endpoint (default: `true`). |
| `activeTabOnly` | `boolean` | Whether to track activity only on the active tab to save CPU/memory (default: `true`). |
| `alert` | `any` | Custom data to be passed to the `tk:idle` event. Ideal for configuring SweetAlert options. |

#### Handling Idle Events (e.g. SweetAlert)

On the client (browser), you can listen for the `tk:idle` event to show a notification. You can use the `alert` property from your configuration to pass options to your alert plugin.

```javascript
// astro.config.mjs
tokenKit({
  idle: {
    timeout: 300,
    alert: {
      title: "Session Expired",
      text: "You have been logged out due to inactivity.",
      icon: "warning"
    }
  }
})
```

```html
<script>
  window.addEventListener('tk:idle', (event) => {
    const options = event.detail.alert;
    // Use SweetAlert or any other plugin
    swal(options);
  });
</script>
```

### Login Options

| Property | Type | Description |
| :--- | :--- | :--- |
| `onLogin` | `Function` | Callback after successful login: `(bundle, body, ctx) => void`. |
| `onError` | `Function` | Callback after failed login: `(error, ctx) => void`. |
| `headers` | `Record<string, string>` | Extra headers for this specific login request. |
| `data` | `Record<string, any>` | Extra data for this specific login request. |

### Request Auth Overrides

When calling `api.get()`, `api.post()`, etc., you can override auth configuration (e.g., for multi-tenancy). Headers provided in the request options are automatically propagated to any automatic token refresh operations:

```typescript
await api.get('/data', {
  headers: { 'x-tenant-name': 'lynx' },
  auth: {
    data: { extra_refresh_param: 'value' }
  }
});
```

## Advanced Usage

### Manual Context

If you prefer not to use middleware, you can bind the Astro context manually for a specific scope:

```typescript
import { runWithContext } from 'astro-tokenkit';

const { data } = await runWithContext(Astro, () => api.get('/data'));
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
const { data: bundle } = await api.login({ username, password }, {
  onLogin: (bundle, body, ctx) => {
    // Post-login logic (e.g., sync session to another store)
    console.log('User logged in!', bundle.sessionPayload);
  },
  onError: (error, ctx) => {
    // Handle error (e.g., log it or perform cleanup)
    console.error('Login failed:', error.message);
  }
});

await api.logout();
```

### Using Promises (.then, .catch, .finally)

All API methods return a Promise that resolves to an `APIResponse` object. You can use traditional promise chaining:

```typescript
// Example with GET request
api.get('/me')
  .then(({ data: user, status }) => {
    console.log(`User ${user.name} fetched with status ${status}`);
  })
  .catch(err => {
    console.error('Failed to fetch user:', err.message);
  })
  .finally(() => {
    console.log('Request finished');
  });

// Example with login
api.login(credentials)
  .then(({ data: token }) => {
    console.log('Successfully logged in!', token.accessToken);
  })
  .catch(err => {
    if (err instanceof AuthError) {
      console.error('Authentication failed:', err.message);
    } else {
      console.error('An unexpected error occurred:', err.message);
    }
  })
  .finally(() => {
    // E.g. stop loading state
  });
```

> **Note:** Since all methods return an `APIResponse` object, you can use destructuring in `.then()` to access the data directly, which allows for clean syntax like `.then(({ data: token }) => ... )`.

## Performance

Astro TokenKit is designed with a "low impact" philosophy. It introduces negligible overhead to your requests while providing powerful features like automatic token rotation.

### Benchmark Results

Run on a standard development machine using `npm run bench`:

| Scenario | Operations/sec | Latency (Overhead) |
| :--- | :--- | :--- |
| **Native fetch (Baseline)** | ~720,000 | 0µs |
| **Middleware overhead** | ~1,680,000 | <1µs |
| **APIClient (No Auth)** | ~200,000 | ~3.5µs |
| **APIClient (With Auth)** | ~150,000 | ~5.3µs |

**Key Takeaways:**
- **Zero-impact Middleware:** The middleware adds less than 1 microsecond to each Astro request.
- **Ultra-low Client Overhead:** Using the `APIClient` adds about 3-5 microseconds per request compared to native `fetch`.
- **Negligible in Real World:** In a typical scenario where a network request takes 10ms (10,000µs), Astro TokenKit adds less than **0.05%** latency.

## License

MIT © [oamm](https://github.com/oamm)

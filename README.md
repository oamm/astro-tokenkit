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
| `resolveHeaders` | `Function` | Resolve dynamic headers from the current Astro context for login, refresh, logout, and regular requests. |
| `timeout` | `number` | Request timeout in milliseconds (default: 30000). |
| `retry` | `RetryConfig` | Retry strategy for failed requests. |
| `interceptors`| `InterceptorsConfig` | Request/Response/Error interceptors. |
| `idle` | `IdleConfig` | Inactivity session timeout configuration. |
| `etagCache` | `EtagCacheProvider` | Optional consumer-owned ETag cache provider. |
| `etagKeyResolver` | `(url, headers) => string` | Resolves keys for opted-in GET requests. |
| `shouldCacheResponse` | `(request, response) => boolean` | Decides whether an ETag response is stored. |
| `context` | `AsyncLocalStorage` | External AsyncLocalStorage instance. |
| `getContextStore`| `() => TokenKitContext`| Custom method to retrieve the context store. |
| `setContextStore`| `(ctx) => void`| Custom method to set the context store. |
| `runWithContext`| `Function`| Custom runner to bind context. |

#### ETag Requests

Pass `etag: true` on an individual GET request to enable conditional caching. Configure `etagCache`, `etagKeyResolver`, and optionally `shouldCacheResponse` when cache storage, key boundaries, or response rules must be controlled by the consumer. The default cache is in-memory and isolated to the client instance.

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  etagKeyResolver: (url, headers) => `${url}|${headers['x-cache-scope'] ?? ''}`,
});

const { data } = await api.get('/widgets', { etag: true });
```

ETag support applies to GET requests only and is disabled unless explicitly requested.

Cache providers implement `get(key)`, `set(key, entry)`, and `delete(key)`, with optional `clear()`. The `shouldCacheResponse(request, response)` callback controls storage and receives parsed response headers, status, and body. Use `await api.invalidateEtagCache({ key })` or `await api.invalidateEtagCache()` after consumer-defined mutations.

```typescript
const cache = new Map<string, { etag: string; body: any }>();
const api = createClient({
  baseURL: 'https://api.example.com',
  etagCache: {
    get: (key) => cache.get(key),
    set: (key, entry) => { cache.set(key, entry); },
    delete: (key) => { cache.delete(key); },
    clear: () => { cache.clear(); },
  },
  etagKeyResolver: (url, headers) => `${url}|${headers['x-cache-scope'] ?? ''}`,
  shouldCacheResponse: (_request, response) => response.status === 200,
});
```

TokenKit does not infer tenant, user, session, locale, service, or feature boundaries. Define those boundaries in `etagKeyResolver` and invalidate affected keys from consumer mutation handling.

ETag handling is server-side because TokenKit runs in Astro's server environment. The upstream `ETag` is available on `result.headers`, but it is not automatically added to the browser's response. To populate the browser cache, forward the header from your Astro route:

```typescript
const result = await api.get('/widgets', { etag: true });
const etag = result.headers.get('etag');

return new Response(JSON.stringify(result.data), {
  status: 200,
  headers: {
    'Content-Type': 'application/json',
    ...(etag ? { ETag: etag } : {}),
  },
});
```

For browser-side conditional requests, the route must also handle the browser's `If-None-Match` header and return `304 Not Modified` when appropriate.

### Auth Configuration

| Property | Type | Description |
| :--- | :--- | :--- |
| `login` | `string` | Endpoint path for login (POST). |
| `refresh` | `string` | Endpoint path for token refresh (POST). |
| `logout` | `string` | Endpoint path for logout (POST). |
| `contentType` | `'application/json' \| 'application/x-www-form-urlencoded'` | Content type for auth requests (default: `application/json`). |
| `headers` | `Record<string, string>` | Extra headers for login/refresh requests. |
| `resolveHeaders` | `Function` | Resolve dynamic headers from the current Astro context for auth requests. |
| `loginData` | `Record<string, any>` | Extra data to be sent with login request. |
| `loginParams` | `Record<string, any>` | Query parameters to be sent with login request. |
| `refreshData` | `Record<string, any>` | Extra data to be sent with refresh request. |
| `refreshParams` | `Record<string, any>` | Query parameters to be sent with refresh request. |
| `refreshRequestField` | `string` | Field name for the refresh token in the refresh request (default: `refreshToken`). |
| `fields` | `FieldMapping` | Custom mapping for token fields in API responses (`accessToken`, `refreshToken`, `expiresAt`, `expiresIn`, `tokenType`, `sessionPayload`). |
| `parseLogin` | `Function` | Custom parser for login response: `(body: any) => TokenBundle`. |
| `parseRefresh`| `Function` | Custom parser for refresh response: `(body: any) => TokenBundle`. |
| `injectToken` | `Function` | Custom token injection: `(token: string, type?: string) => string` (default: Bearer). |
| `cookies` | `CookieConfig` | Configuration for auth cookies. |
| `storage` | `TokenStorageConfig` | Token storage backend. Use `{ type: 'cookie' }` (default) or `{ type: 'session' }`. |
| `policy` | `RefreshPolicy` | Strategy for when to trigger token refresh. |

#### Dynamic Headers

Use `resolveHeaders` when headers depend on the incoming Astro request, such as a tenant header. The resolver runs for `login`, `refresh`, `logout`, and regular `request` calls.

```typescript
tokenKit({
  baseURL: 'https://api.example.com',
  resolveHeaders: (ctx, { operation, request }) => {
    const tenant = ctx.request.headers.get('x-tenant-name');

    return tenant ? { 'x-tenant-name': tenant } : {};
  },
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh'
  }
});
```

Headers are merged in this order: static client headers, static auth headers for auth requests, resolved headers, then per-request headers. Automatic refresh requests include resolved headers in their single-flight key, so concurrent refreshes for different tenants are not collapsed into one request.

#### Token Storage

By default, TokenKit stores the access token, refresh token, expiry, and token type as separate HttpOnly cookies. To hide those token values behind Astro's session provider, enable session storage:

```javascript
tokenKit({
  baseURL: 'https://api.example.com',
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    storage: { type: 'session' }
  }
})
```

Session storage uses `ctx.session.get/set/delete` and writes the token bundle under the `tokenkit` session key. When TokenKit clears auth state during logout, invalid refresh, or idle cleanup, it calls `ctx.session.destroy()` if available so all session data is removed. If `destroy()` is not available, it falls back to deleting only the TokenKit key. You can customize the key:

```javascript
storage: { type: 'session', key: 'auth_tokens' }
```

Because Astro session reads are asynchronous, use `await api.getSessionAsync()` in routes when `storage.type` is `'session'`. The synchronous `api.getSession()` helper only supports cookie storage. To get a valid session and refresh expired tokens when possible, use `await api.getValidSessionAsync()`. To manually trigger a refresh even when the current access token is still valid, use `await api.refreshSessionAsync()`. In multi-page sites, keep the TokenKit middleware enabled so every page request can run the refresh policy before page code reads the session.

`getSessionAsync()` is a read-only helper: it returns `null` for an expired access token, but when a refresh token is still present in Astro session storage it leaves the session record intact so middleware or `getValidSessionAsync()` can renew it.

For debugging refresh behavior manually:

```typescript
import { api } from 'astro-tokenkit';

const session = await api.refreshSessionAsync({
  headers: { 'x-debug-refresh': '1' },
  data: { source: 'manual-debug' },
});
```

If you are not using Astro's built-in session provider, pass a custom provider:

```javascript
storage: {
  type: 'session',
  provider: {
    get: (ctx, key) => ctx.locals.session.get(key),
    set: (ctx, key, value, options) => ctx.locals.session.set(key, value, options),
    delete: (ctx, key) => ctx.locals.session.delete(key),
    destroy: (ctx) => ctx.locals.session.destroy()
  }
}
```

### Idle Session Timeout

Astro TokenKit automatically monitors user inactivity and closes the session across all open tabs. This feature uses `BroadcastChannel` to synchronize activity and logout events.

**Important:** When using the Astro integration, the `onIdle` function cannot be passed in `astro.config.mjs` because it is not serializable. Instead, you can pass the name of a global function as a string, or listen for the `tk:idle` event on the client.

| Property | Type | Description |
| :--- | :--- | :--- |
| `timeout` | `number` | **Required.** Inactivity timeout in seconds. |
| `onIdle` | `Function \| string` | Optional callback when idle timeout is reached. Can be a function or the name of a global function (string). |
| `autoLogout`| `boolean` | Whether to automatically mark the Astro session for cleanup and call the configured logout endpoint when available (default: `true`). |
| `keepAlive` | `boolean` | Whether active browser sessions should periodically touch Astro middleware so tokens can refresh before expiry (default: `false`). Useful for SPA-style screens with little or no server navigation. |
| `keepAliveInterval` | `number` | Minimum seconds between activity-triggered keepalive requests (default: `60`). |
| `reload` | `boolean` | Whether to reload the page after automatic logout (default: `true`). |
| `activeTabOnly` | `boolean` | Whether to track activity only on the active tab to save CPU/memory (default: `true`). |
| `alert` | `any` | Custom data to be passed to the `tk:idle` event. Ideal for configuring SweetAlert options. |

For SPA-style screens, set `keepAlive: true` to send a throttled same-origin `HEAD` request to the current Astro route while the user remains active. This lets middleware run the normal refresh policy even when user interaction does not otherwise trigger server navigation or API calls. Multi-page sites usually do not need this because normal page requests already reach middleware.

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

#### Overriding Auto-Logout Behavior

By default, TokenKit automatically calls your logout endpoint and reloads the page. You can override this behavior by providing an `onIdle` callback (function or string) in your configuration.

```javascript
// astro.config.mjs
export default defineConfig({
  integrations: [
    tokenKit({
      idle: {
        timeout: 60 * 15,
        // Disables default logout/reload and runs this instead
        onIdle: 'myCustomLogout'
      }
    })
  ]
});
```

### Login Options

| Property | Type | Description |
| :--- | :--- | :--- |
| `onLogin` | `Function` | Callback after successful login: `(bundle, body, ctx) => void`. |
| `onError` | `Function` | Callback after failed login: `(error, ctx) => void`. |
| `headers` | `Record<string, string>` | Extra headers for this specific login request. |
| `data` | `Record<string, any>` | Extra data for this specific login request. |
| `params` | `Record<string, any>` | Query parameters for this specific login request. |

For auth servers that accept token lifetime in the login URL, pass it as a query parameter instead of baking a specific field name into TokenKit:

```typescript
await api.login({ username, password }, {
  params: {
    token_duration_minutes: 30
  }
});
```

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

### File and Binary Uploads

Use `sendBytes()` for `application/octet-stream` requests:

```typescript
import { MIME_TYPES } from 'astro-tokenkit';

const { data } = await api.sendBytes('/storage/raw', fileBytes, {
  contentType: MIME_TYPES.OCTET_STREAM,
  accept: 'application/json',
});
```

Use `uploadFiles()` for multipart uploads while keeping TokenKit as the single API client for base URL, auth, timeout, retries, and SSL options:

```typescript
import { getDocumentMimeType, MIME_TYPES } from 'astro-tokenkit';

const { data } = await api.uploadFiles<Document[]>(
  `/storage/documents/${folder.replace(/:/g, '_')}`,
  documents
    .filter(doc => doc.file)
    .map((doc, index) => ({
      file: doc.file,
      name: doc.name || `Document ${index + 1}`,
      filename: doc.filename,
      contentType: doc.filename ? getDocumentMimeType(doc.filename) : MIME_TYPES.OCTET_STREAM,
    })),
  {
    params: { batchId },
  }
);
```

By default, `uploadFiles()` appends each file as `files[index]` and each document name as `Name[index]`. For a prebuilt `FormData` instance, use `uploadForm()`. TokenKit does not set `Content-Type` for multipart requests, allowing `fetch` to include the correct boundary. `MIME_TYPES` and `getDocumentMimeType()` are exported for consistent upload metadata:

```typescript
import { getDocumentMimeType, MIME_TYPES } from 'astro-tokenkit';

const contentType = getDocumentMimeType(file.name, MIME_TYPES.OCTET_STREAM);
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

If a logout endpoint is configured, `api.logout()` first obtains a valid access token when possible, including refreshing an expired access token with the stored refresh token. It then calls the logout endpoint and clears local TokenKit storage. With Astro session storage, clearing uses `ctx.session.destroy()` when available so the session cookie and stored session data are removed.

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

---

## Playground

We've included a [playground](./playground) project to quickly test the integration.

To run the playground:

```bash
npm run playground
```

This will install the dependencies and start the Astro dev server for the playground.

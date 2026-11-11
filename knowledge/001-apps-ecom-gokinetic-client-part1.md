# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/client (part 1 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 26

## Files

- `apps/ecom-gokinetic/client/.env.example` (8 lines)
- `apps/ecom-gokinetic/client/index.html` (14 lines)
- `apps/ecom-gokinetic/client/package.json` (31 lines)
- `apps/ecom-gokinetic/client/src/App.jsx` (43 lines)
- `apps/ecom-gokinetic/client/src/api/client.js` (151 lines)
- `apps/ecom-gokinetic/client/src/api/client.test.js` (88 lines)
- `apps/ecom-gokinetic/client/src/api/endpoints.js` (99 lines)
- `apps/ecom-gokinetic/client/src/components/AddressFields.jsx` (33 lines)
- `apps/ecom-gokinetic/client/src/components/AvailabilityChecker.jsx` (56 lines)
- `apps/ecom-gokinetic/client/src/components/Layout.jsx` (60 lines)
- `apps/ecom-gokinetic/client/src/components/OrderTimeline.jsx` (38 lines)
- `apps/ecom-gokinetic/client/src/components/PlanCard.jsx` (45 lines)
- `apps/ecom-gokinetic/client/src/components/PriceSummary.jsx` (64 lines)
- `apps/ecom-gokinetic/client/src/components/components.test.jsx` (109 lines)
- `apps/ecom-gokinetic/client/src/components/ui.jsx` (116 lines)
- `apps/ecom-gokinetic/client/src/context/AuthContext.jsx` (118 lines)
- `apps/ecom-gokinetic/client/src/context/CartContext.jsx` (127 lines)
- `apps/ecom-gokinetic/client/src/hooks/useAsync.js` (75 lines)
- `apps/ecom-gokinetic/client/src/hooks/useAvailability.js` (56 lines)
- `apps/ecom-gokinetic/client/src/hooks/useForm.js` (99 lines)
- `apps/ecom-gokinetic/client/src/lib/format.js` (83 lines)
- `apps/ecom-gokinetic/client/src/lib/lib.test.js` (103 lines)
- `apps/ecom-gokinetic/client/src/lib/paymentTokenizer.js` (79 lines)
- `apps/ecom-gokinetic/client/src/lib/sites.js` (100 lines)
- `apps/ecom-gokinetic/client/src/lib/validation.js` (80 lines)
- `apps/ecom-gokinetic/client/src/main.jsx` (20 lines)

## apps/ecom-gokinetic/client/.env.example

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: bash. Path: `apps/ecom-gokinetic/client/.env.example`.

```bash
# API base path (same-origin in production behind the gateway; proxied by Vite in dev)
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://localhost:4000

# Payment gateway hosted tokenisation (publishable key only; never a secret key)
VITE_PAYMENT_TOKENIZE_URL=https://payments.sandbox.example/v2/tokens
VITE_PAYMENT_PUBLISHABLE_KEY=pk_sandbox_replace_me
```

## apps/ecom-gokinetic/client/index.html

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: html. Path: `apps/ecom-gokinetic/client/index.html`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="GoKinetic fibre broadband: check availability, compare plans and order online." />
    <title>GoKinetic Fibre</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

## apps/ecom-gokinetic/client/package.json

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: json. Path: `apps/ecom-gokinetic/client/package.json`.

```json
{
  "name": "@uniti/ecom-gokinetic-client",
  "version": "1.0.0",
  "private": true,
  "description": "GoKinetic / Business GoKinetic storefront and checkout SPA.",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "eslint": "^8.57.0",
    "jsdom": "^25.0.0",
    "vite": "^5.4.8",
    "vitest": "^2.1.1"
  }
}
```

## apps/ecom-gokinetic/client/src/App.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/App.jsx`.

```jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout, ProtectedRoute } from './components/Layout';
import { PlansPage } from './pages/PlansPage';
import { ComparePage } from './pages/ComparePage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { LoginPage, RegisterPage, ActivatePage } from './pages/AuthPages';
import { AccountLayout, OrdersList, OrderPage, InvoicesList, ProfilePage } from './pages/account/AccountPages';
import { QuotesPage, QuoteRequestPage, QuoteDetailPage, TeamPage } from './pages/business/BusinessPages';
import { EmptyState } from './components/ui';

const signedIn = (element, options) => <ProtectedRoute {...options}>{element}</ProtectedRoute>;
const business = { segment: 'BUSINESS' };

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PlansPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="business/activate" element={<ActivatePage />} />
        <Route path="checkout" element={signedIn(<CheckoutPage />, { roles: ['CONSUMER', 'BUSINESS_ADMIN', 'BUSINESS_USER'] })} />
        <Route path="orders/:orderNumber" element={signedIn(<OrderPage />)} />
        <Route path="account" element={signedIn(<AccountLayout />)}>
          <Route index element={<OrdersList />} />
          <Route path="invoices" element={<InvoicesList />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="business" element={<Navigate to="/business/quotes" replace />} />
        <Route path="business/quotes" element={signedIn(<QuotesPage />, business)} />
        <Route path="business/quotes/new" element={signedIn(<QuoteRequestPage />, business)} />
        <Route path="business/quotes/:quoteNumber" element={signedIn(<QuoteDetailPage />, business)} />
        <Route path="business/team" element={signedIn(<TeamPage />, { ...business, roles: ['BUSINESS_ADMIN'] })} />
        <Route path="*" element={<EmptyState title="Page not found"><p>The page you were looking for does not exist.</p></EmptyState>} />
      </Route>
    </Routes>
  );
}
```

## apps/ecom-gokinetic/client/src/api/client.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/api/client.js`.

```javascript
/**
 * HTTP client for the eCom API.
 *
 * - every request carries a fresh X-Correlation-Id so support can trace a
 *   shopper's action end-to-end; the server's echo is kept on errors
 * - RFC 7807 problem+json responses become ApiError instances with the
 *   field errors and business rule code preserved
 * - a 401 on an authenticated call triggers one refresh-and-retry; parallel
 *   401s share the same refresh so the rotating refresh token is used once
 */

export class ApiError extends Error {
  constructor({ status, type, title, detail, errors = [], code, correlationId, extensions = {} }) {
    super(detail || title || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.code = code;
    this.correlationId = correlationId;
    this.extensions = extensions;
  }

  /** Field errors keyed by path, e.g. { 'address.postalCode': 'Has an invalid format.' }. */
  get fieldErrors() {
    return Object.fromEntries(this.errors.map((e) => [e.path, e.message]));
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

export function newCorrelationId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Idempotency keys for unsafe POSTs: stable for one user action, unique across actions. */
export function newIdempotencyKey(prefix = 'web') {
  return `${prefix}-${newCorrelationId()}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function toApiError(response, correlationId) {
  const contentType = response.headers.get('Content-Type') || '';
  let body = null;
  try {
    body = contentType.includes('json') ? await response.json() : null;
  } catch {
    body = null;
  }
  const { type, title, detail, errors, code, status, correlationId: echoed, instance, ...extensions } = body || {};
  return new ApiError({
    status: response.status,
    type,
    title: title || response.statusText,
    detail,
    errors: Array.isArray(errors) ? errors : [],
    code,
    correlationId: echoed || response.headers.get('X-Correlation-Id') || correlationId,
    extensions,
  });
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {() => string|null} [options.getAccessToken]
 * @param {() => Promise<boolean>} [options.refreshSession] resolves true when a new token is available
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createApiClient({
  baseUrl = '/api/v1',
  getAccessToken = () => null,
  refreshSession = async () => false,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  let refreshing = null;

  function sharedRefresh() {
    if (!refreshing) {
      refreshing = Promise.resolve(refreshSession()).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function send(method, path, { body, query, headers = {}, signal, auth = true }, allowRetry) {
    const correlationId = newCorrelationId();
    const token = auth ? getAccessToken() : null;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}${buildQuery(query)}`, {
        method,
        signal,
        headers: {
          Accept: 'application/json, application/problem+json',
          'X-Correlation-Id': correlationId,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new ApiError({
        status: 0,
        title: 'Network error',
        detail: 'We could not reach GoKinetic. Check your connection and try again.',
        correlationId,
      });
    }

    if (response.status === 401 && token && allowRetry && (await sharedRefresh())) {
      return send(method, path, { body, query, headers, signal, auth }, false);
    }
    if (!response.ok) throw await toApiError(response, correlationId);
    if (response.status === 204) return { data: null, headers: response.headers };
    const text = await response.text();
    return { data: text ? JSON.parse(text) : null, headers: response.headers };
  }

  /** Returns just the parsed body. */
  const call = (method) => async (path, options = {}) => (await send(method, path, options, true)).data;

  return {
    get: call('GET'),
    post: call('POST'),
    put: call('PUT'),
    patch: call('PATCH'),
    delete: call('DELETE'),
    /** Full response (body + headers) for calls that need a header, e.g. X-Cart-Token. */
    raw: (method, path, options = {}) => send(method, path, options, true),
  };
}
```

## apps/ecom-gokinetic/client/src/api/client.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/api/client.test.js`.

```javascript
import { describe, expect, test, vi } from 'vitest';
import { ApiError, createApiClient, newIdempotencyKey } from './client';

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers },
  });

describe('createApiClient', () => {
  test('sends a correlation id, bearer token and query string', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { items: [] }));
    const api = createApiClient({ baseUrl: '/api/v1', fetchImpl, getAccessToken: () => 'tok' });
    await api.get('/products', { query: { segment: 'CONSUMER', search: '', skus: ['A', 'B'] } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/products?segment=CONSUMER&skus=A%2CB');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-Correlation-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('turns problem+json into an ApiError with field errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(422, {
        type: 'https://errors.gokinetic.example/problems/business-rule-violation',
        title: 'Business rule violated',
        status: 422,
        detail: 'This promo code has expired.',
        code: 'PROMO_EXPIRED',
        correlationId: 'srv-123',
        errors: [{ path: 'code', message: 'Expired.' }],
      }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.put('/carts/1/promo', { body: { code: 'OLD' } }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'PROMO_EXPIRED', correlationId: 'srv-123', detail: 'This promo code has expired.' });
    expect(error.fieldErrors).toEqual({ code: 'Expired.' });
  });

  test('refreshes once on 401 and retries; concurrent 401s share the refresh', async () => {
    let token = 'old';
    const refreshSession = vi.fn(async () => {
      token = 'new';
      return true;
    });
    const fetchImpl = vi.fn(async (_url, init) =>
      init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { status: 401, title: 'Unauthorized' }),
    );
    const api = createApiClient({ fetchImpl, getAccessToken: () => token, refreshSession });

    const results = await Promise.all([api.get('/orders'), api.get('/invoices')]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  test('gives up after one failed refresh', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { status: 401, title: 'Unauthorized' }));
    const api = createApiClient({ fetchImpl, getAccessToken: () => 'x', refreshSession: async () => false });
    await expect(api.get('/orders')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('network failures become status-0 errors', async () => {
    const api = createApiClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    const error = await api.get('/health').catch((e) => e);
    expect(error.isNetworkError).toBe(true);
  });

  test('raw exposes response headers and 204 yields null', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(201, { id: 'c1' }, { 'X-Cart-Token': 'guest' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createApiClient({ fetchImpl });
    const { data, headers } = await api.raw('POST', '/carts', { body: { segment: 'CONSUMER' } });
    expect(data.id).toBe('c1');
    expect(headers.get('X-Cart-Token')).toBe('guest');
    expect(await api.post('/auth/logout', { body: {} })).toBeNull();
  });
});

test('idempotency keys satisfy the server pattern', () => {
  const key = newIdempotencyKey('order');
  expect(key).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  expect(newIdempotencyKey('order')).not.toBe(key);
});
```

## apps/ecom-gokinetic/client/src/api/endpoints.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/api/endpoints.js`.

```javascript
import { newIdempotencyKey } from './client';

/**
 * Typed-ish wrappers for each API resource. Components never build URLs
 * themselves, so route changes stay in one place.
 */

const CART_TOKEN = 'X-Cart-Token';
const enc = encodeURIComponent;

export function createEndpoints(api) {
  const cartHeaders = (guestToken) => (guestToken ? { [CART_TOKEN]: guestToken } : {});

  return {
    auth: {
      login: (body) => api.post('/auth/login', { body, auth: false }),
      register: (body) => api.post('/auth/register', { body, auth: false }),
      refresh: (refreshToken) => api.post('/auth/refresh', { body: { refreshToken }, auth: false }),
      logout: (refreshToken) => api.post('/auth/logout', { body: { refreshToken }, auth: false }),
      activate: (body) => api.post('/auth/activate', { body, auth: false }),
      changePassword: (body) => api.post('/auth/change-password', { body }),
    },

    catalog: {
      list: (query, options) => api.get('/products', { query, ...options }),
      detail: (sku, segment) => api.get(`/products/${enc(sku)}`, { query: { segment } }),
      compare: (skus) => api.get('/products/compare', { query: { skus } }),
    },

    serviceability: {
      check: (address, segment) => api.post('/serviceability/checks', { body: { address, segment } }),
      installSlots: (checkId, days = 14) => api.get(`/serviceability/checks/${enc(checkId)}/install-slots`, { query: { days } }),
    },

    carts: {
      async create(segment) {
        const { data, headers } = await api.raw('POST', '/carts', { body: { segment } });
        return { cart: data, guestToken: headers.get(CART_TOKEN) || data.guestToken || null };
      },
      get: (cartId, guestToken) => api.get(`/carts/${enc(cartId)}`, { headers: cartHeaders(guestToken) }),
      addItem: (cartId, guestToken, sku, quantity = 1) =>
        api.post(`/carts/${enc(cartId)}/items`, { body: { sku, quantity }, headers: cartHeaders(guestToken) }),
      updateItem: (cartId, guestToken, sku, quantity) =>
        api.patch(`/carts/${enc(cartId)}/items/${enc(sku)}`, { body: { quantity }, headers: cartHeaders(guestToken) }),
      removeItem: (cartId, guestToken, sku) =>
        api.delete(`/carts/${enc(cartId)}/items/${enc(sku)}`, { headers: cartHeaders(guestToken) }),
      setTerm: (cartId, guestToken, contractTermMonths) =>
        api.put(`/carts/${enc(cartId)}/term`, { body: { contractTermMonths }, headers: cartHeaders(guestToken) }),
      setAddress: (cartId, guestToken, address) =>
        api.put(`/carts/${enc(cartId)}/address`, { body: { address }, headers: cartHeaders(guestToken) }),
      applyPromo: (cartId, guestToken, code) =>
        api.put(`/carts/${enc(cartId)}/promo`, { body: { code }, headers: cartHeaders(guestToken) }),
      removePromo: (cartId, guestToken) => api.delete(`/carts/${enc(cartId)}/promo`, { headers: cartHeaders(guestToken) }),
      claim: (cartId, guestToken) => api.post(`/carts/${enc(cartId)}/claim`, { headers: cartHeaders(guestToken) }),
    },

    checkout: {
      /** `idempotencyKey` must be reused when the shopper retries the same submission. */
      placeOrder: (body, idempotencyKey = newIdempotencyKey('order')) =>
        api.post('/checkout/orders', { body, headers: { 'Idempotency-Key': idempotencyKey } }),
    },

    orders: {
      list: (query) => api.get('/orders', { query }),
      get: (orderNumber) => api.get(`/orders/${enc(orderNumber)}`),
      tracking: (orderNumber) => api.get(`/orders/${enc(orderNumber)}/tracking`),
      cancel: (orderNumber, reason) => api.post(`/orders/${enc(orderNumber)}/cancel`, { body: { reason } }),
    },

    invoices: {
      list: (query) => api.get('/invoices', { query }),
      get: (invoiceNumber) => api.get(`/invoices/${enc(invoiceNumber)}`),
    },

    quotes: {
      request: (body) => api.post('/quotes', { body }),
      list: (query) => api.get('/quotes', { query }),
      get: (quoteNumber) => api.get(`/quotes/${enc(quoteNumber)}`),
      accept: (quoteNumber, poNumber) => api.post(`/quotes/${enc(quoteNumber)}/accept`, { body: poNumber ? { poNumber } : {} }),
      reject: (quoteNumber, reason) => api.post(`/quotes/${enc(quoteNumber)}/reject`, { body: reason ? { reason } : {} }),
      convert: (quoteNumber, paymentToken, idempotencyKey = newIdempotencyKey('convert')) =>
        api.post(`/quotes/${enc(quoteNumber)}/convert`, {
          body: paymentToken ? { paymentToken } : {},
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
    },

    account: {
      overview: () => api.get('/account'),
      updateProfile: (body) => api.patch('/account/profile', { body }),
      addAddress: (body) => api.post('/account/addresses', { body }),
      removeAddress: (addressId) => api.delete(`/account/addresses/${enc(addressId)}`),
      members: () => api.get('/account/users'),
      invite: (body) => api.post('/account/users', { body }),
      disable: (userId) => api.post(`/account/users/${enc(userId)}/disable`),
    },
  };
}
```

## apps/ecom-gokinetic/client/src/components/AddressFields.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/AddressFields.jsx`.

```jsx
import { Field } from './ui';
import { US_STATES } from '../lib/validation';

/**
 * Street address inputs bound to a useForm instance under `prefix`.
 * Reused by the availability check, checkout billing address and account
 * address book.
 */
export function AddressFields({ form, prefix = 'address', legend = 'Address' }) {
  const f = (name) => form.field(`${prefix}.${name}`);
  return (
    <fieldset className="address-fields">
      <legend>{legend}</legend>
      <Field label="Street address" autoComplete="address-line1" {...f('line1')} />
      <Field label="Apartment, suite, unit (optional)" autoComplete="address-line2" {...f('line2')} />
      <div className="address-fields__row">
        <Field label="City" autoComplete="address-level2" {...f('city')} />
        <Field label="State" as="select" autoComplete="address-level1" {...f('state')}>
          <option value="">Select</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Field>
        <Field label="ZIP code" inputMode="numeric" autoComplete="postal-code" {...f('postalCode')} />
      </div>
    </fieldset>
  );
}

export const EMPTY_ADDRESS = { line1: '', line2: '', city: '', state: '', postalCode: '' };
```

## apps/ecom-gokinetic/client/src/components/AvailabilityChecker.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/AvailabilityChecker.jsx`.

```jsx
import { useForm } from '../hooks/useForm';
import { addressSchema, trimAddress } from '../lib/validation';
import { formatAddress, formatSpeed } from '../lib/format';
import { AddressFields, EMPTY_ADDRESS } from './AddressFields';
import { Button, ProblemAlert } from './ui';

const REASONS = {
  ADDRESS_NOT_FOUND: 'We could not find that address. Check the street and ZIP code.',
  NOT_QUALIFIED: 'Our fibre network does not reach this address yet.',
};

/**
 * Address entry + result banner. Calls `onCheck(address)` which must return
 * the serviceability check.
 */
export function AvailabilityChecker({ availability, segment }) {
  const form = useForm({ address: availability.address || EMPTY_ADDRESS }, addressSchema('address'));
  const { check } = availability;

  const submit = form.handleSubmit(async ({ address }) => {
    await availability.runCheck(trimAddress(address), segment);
  });

  return (
    <section className="availability" aria-labelledby="availability-title">
      <h2 id="availability-title">Check fibre availability</h2>
      {check ? (
        <div className={`alert ${check.serviceable ? 'alert--success' : 'alert--warning'}`} role="status">
          <p>
            <strong>{formatAddress(check.address)}</strong>
          </p>
          {check.serviceable ? (
            <p>
              Great news: speeds up to {formatSpeed(check.maxDownloadMbps)} are available.
              {check.requiresSiteSurvey && ' A short site survey is needed before installation.'}
            </p>
          ) : (
            <p>{REASONS[check.reasonCode] || REASONS.NOT_QUALIFIED}</p>
          )}
          <button type="button" className="btn btn--link" onClick={availability.clear}>
            Check a different address
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <AddressFields form={form} legend="Service address" />
          <ProblemAlert error={form.formError} />
          <Button type="submit" pending={form.submitting}>
            Check availability
          </Button>
        </form>
      )}
    </section>
  );
}
```

## apps/ecom-gokinetic/client/src/components/Layout.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/Layout.jsx`.

```jsx
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Spinner } from './ui';

export function Layout() {
  const { user, isAuthenticated, isBusiness, logout } = useAuth();
  const { itemCount } = useCart();
  const brand = isBusiness ? 'Business GoKinetic' : 'GoKinetic';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <Link to="/" className="header__brand">{brand}</Link>
        <nav aria-label="Main">
          <NavLink to="/plans">Plans</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          {isBusiness && <NavLink to="/business/quotes">Quotes</NavLink>}
          {isAuthenticated && <NavLink to="/account">My account</NavLink>}
          <NavLink to="/cart" aria-label={`Cart, ${itemCount} items`}>
            Cart{itemCount > 0 && <span className="header__count">{itemCount}</span>}
          </NavLink>
          {isAuthenticated ? (
            <button type="button" className="btn btn--link" onClick={logout}>
              Sign out {user.firstName}
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <p>Prices exclude taxes unless shown. Speeds are maximum line rates; Wi-Fi speeds vary.</p>
      </footer>
    </div>
  );
}

/**
 * Guards a route: waits for session restore, sends anonymous users to
 * sign-in (returning afterwards) and optionally requires a segment/role.
 * The server enforces the same rules; this only avoids dead-end pages.
 */
export function ProtectedRoute({ children, segment, roles }) {
  const { status, user, hasRole } = useAuth();
  const location = useLocation();
  if (status === 'restoring') return <Spinner label="Restoring your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if ((segment && user.segment !== segment) || (roles && !hasRole(...roles))) {
    return <Navigate to="/account" replace />;
  }
  return children;
}
```

## apps/ecom-gokinetic/client/src/components/OrderTimeline.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/OrderTimeline.jsx`.

```jsx
import { formatDate } from '../lib/format';

const STATE_TEXT = { COMPLETE: 'Done', CURRENT: 'In progress', UPCOMING: 'Expected', SKIPPED: 'Not reached' };

/** Renders the server-built tracking timeline (domain/orderTracking.js). */
export function OrderTimeline({ timeline }) {
  return (
    <div className="timeline">
      {timeline.closed && (
        <p className="alert alert--warning" role="status">
          This order was {timeline.status === 'CANCELLED' ? 'cancelled' : 'not completed'}
          {timeline.closedReason ? `: ${timeline.closedReason}` : '.'}
        </p>
      )}
      <ol>
        {timeline.steps.map((step) => (
          <li key={step.status} className={`timeline__step timeline__step--${step.state.toLowerCase()}`} aria-current={step.state === 'CURRENT' ? 'step' : undefined}>
            <span className="timeline__label">{step.label}</span>
            <span className="timeline__state">{STATE_TEXT[step.state]}</span>
            <span className="timeline__date">
              {step.completedAt
                ? formatDate(step.completedAt)
                : step.estimatedAt
                  ? `by ${formatDate(step.estimatedAt)}`
                  : null}
            </span>
          </li>
        ))}
      </ol>
      {timeline.installAppointment && (
        <p>
          Installation appointment: <strong>{formatDate(timeline.installAppointment, { dateStyle: 'full', timeStyle: 'short' })}</strong>
        </p>
      )}
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/components/PlanCard.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/PlanCard.jsx`.

```jsx
import { formatMoney, formatSpeed } from '../lib/format';
import { Button } from './ui';

/**
 * A plan tile. `availability` is 'available' | 'unavailable' | 'unknown'
 * (no address checked yet), which decides the call to action.
 */
export function PlanCard({ plan, availability = 'unknown', recommended, onSelect, onToggleCompare, comparing, pending }) {
  return (
    <article className={`plan${recommended ? ' plan--recommended' : ''}`} aria-labelledby={`plan-${plan.sku}`}>
      {recommended && <p className="plan__flag">Recommended for your address</p>}
      <h3 id={`plan-${plan.sku}`}>{plan.name}</h3>
      <p className="plan__speed">
        {formatSpeed(plan.speedMbps)}
        {plan.uploadMbps ? <span> / {formatSpeed(plan.uploadMbps)} upload</span> : null}
      </p>
      <p className="plan__price">
        <strong>{formatMoney(plan.monthlyPrice)}</strong>/mo
      </p>
      {plan.installationFee > 0 && (
        <p className="plan__install">Installation {formatMoney(plan.installationFee)} (free on 12+ month terms)</p>
      )}
      <ul className="plan__features">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="plan__actions">
        {availability === 'unavailable' ? (
          <p className="plan__unavailable">Not available at your address</p>
        ) : (
          <Button onClick={() => onSelect(plan)} pending={pending}>
            {availability === 'available' ? 'Choose plan' : 'Check availability'}
          </Button>
        )}
        {onToggleCompare && (
          <label className="plan__compare">
            <input type="checkbox" checked={comparing} onChange={() => onToggleCompare(plan.sku)} /> Compare
          </label>
        )}
      </div>
    </article>
  );
}
```

## apps/ecom-gokinetic/client/src/components/PriceSummary.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/PriceSummary.jsx`.

```jsx
import { formatMoney, formatTerm } from '../lib/format';

function Row({ label, amount, credit, strong }) {
  if (!amount) return null;
  return (
    <div className={`summary__row${strong ? ' summary__row--strong' : ''}`}>
      <dt>{label}</dt>
      <dd>{credit ? `-${formatMoney(amount)}` : formatMoney(amount)}</dd>
    </div>
  );
}

/**
 * Breakdown of the server's pricing result (see domain/pricing.js):
 * what is due today and what the monthly bill will be. Every number comes
 * from the API; the client never recomputes prices.
 */
export function PriceSummary({ pricing }) {
  if (!pricing) return null;
  const { recurring, oneTime, promo, introductory } = pricing;
  return (
    <section className="summary" aria-label="Price summary">
      <h3>Monthly</h3>
      <dl>
        <Row label="Plan and add-ons" amount={recurring.subtotal} />
        <Row label={`${formatTerm(pricing.contractTermMonths)} discount`} amount={recurring.termDiscount} credit />
        <Row label={`Multi-site discount (${pricing.volumeDiscountBps / 100}%)`} amount={recurring.volumeDiscount} credit />
        <Row label="Negotiated discount" amount={recurring.negotiatedDiscount} credit />
        <Row label={`Promotion ${promo ? promo.code : ''}`} amount={recurring.promoDiscount} credit />
        <Row label="Estimated tax" amount={recurring.tax} />
        <div className="summary__row summary__row--strong">
          <dt>Monthly total</dt>
          <dd>{formatMoney(recurring.total)}</dd>
        </div>
      </dl>
      {introductory && introductory.freeMonths > 0 && (
        <p className="summary__note">
          Your first {introductory.freeMonths} month{introductory.freeMonths > 1 ? 's are' : ' is'} free. First bill:{' '}
          {formatMoney(pricing.firstMonthlyBill)}.
        </p>
      )}

      <h3>Due today</h3>
      <dl>
        <Row label="Equipment" amount={oneTime.hardware} />
        <Row label="Installation" amount={oneTime.installation} />
        <Row label="Installation waived" amount={oneTime.installationWaived} credit />
        <Row label="Promotion" amount={oneTime.promoDiscount} credit />
        <Row label="Estimated tax" amount={oneTime.tax} />
        <div className="summary__row summary__row--strong">
          <dt>Due today</dt>
          <dd>{formatMoney(pricing.dueToday)}</dd>
        </div>
      </dl>
      {pricing.totalContractValue != null && (
        <p className="summary__note">Total over {pricing.contractTermMonths} months: {formatMoney(pricing.totalContractValue)}</p>
      )}
      {promo && !promo.applied && promo.reason && (
        <p className="summary__warning">Promo {promo.code} does not reduce this order.</p>
      )}
    </section>
  );
}
```

## apps/ecom-gokinetic/client/src/components/components.test.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/components.test.jsx`.

```jsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceSummary } from './PriceSummary';
import { ProblemAlert, Pagination, StatusBadge } from './ui';
import { OrderTimeline } from './OrderTimeline';
import { useForm } from '../hooks/useForm';
import { rules } from '../lib/validation';
import { ApiError } from '../api/client';

const PRICING = {
  contractTermMonths: 24,
  volumeDiscountBps: 0,
  recurring: { subtotal: 8000, termDiscount: 400, volumeDiscount: 0, negotiatedDiscount: 0, promoDiscount: 0, tax: 475, total: 8075 },
  oneTime: { hardware: 12900, installation: 9900, installationWaived: 9900, promoDiscount: 0, tax: 806, total: 13706 },
  promo: { code: 'WELCOME-3FREE', applied: true },
  introductory: { freeMonths: 3, monthlyCredit: 8075 },
  dueToday: 13706,
  firstMonthlyBill: 0,
  totalContractValue: 169575,
};

describe('PriceSummary', () => {
  test('shows monthly and due-today totals with credits and free months', () => {
    render(<PriceSummary pricing={PRICING} />);
    expect(screen.getByText('Monthly total').nextSibling).toHaveTextContent('$80.75');
    expect(screen.getByText('24-month contract discount').nextSibling).toHaveTextContent('-$4.00');
    expect(screen.getByText('Installation waived').nextSibling).toHaveTextContent('-$99.00');
    expect(screen.getByText(/Due today/, { selector: 'dt' }).nextSibling).toHaveTextContent('$137.06');
    expect(screen.getByText(/first 3 months are free/i)).toBeInTheDocument();
    expect(screen.queryByText('Negotiated discount')).not.toBeInTheDocument();
  });
});

describe('ProblemAlert', () => {
  test('hides internal detail but shows the reference for server errors', () => {
    render(<ProblemAlert error={new ApiError({ status: 500, title: 'Internal server error', detail: 'stack', correlationId: 'cid-42' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(screen.getByText('cid-42')).toBeInTheDocument();
    expect(screen.queryByText('stack')).not.toBeInTheDocument();
  });

  test('shows rate-limit retry hints and a retry button', async () => {
    const onRetry = vi.fn();
    render(<ProblemAlert error={new ApiError({ status: 429, detail: 'Rate limit exceeded.', extensions: { retryAfterSeconds: 30 } })} onRetry={onRetry} />);
    expect(screen.getByText('Try again in 30 seconds.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

test('Pagination disables the edges and reports page changes', async () => {
  const onChange = vi.fn();
  render(<Pagination page={1} pageSize={10} total={25} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onChange).toHaveBeenCalledWith(2);
});

test('StatusBadge uses customer-friendly labels', () => {
  render(<StatusBadge status="OVERDUE" />);
  expect(screen.getByText('Overdue')).toHaveClass('badge--danger');
});

test('OrderTimeline marks the current step and explains closures', () => {
  render(
    <OrderTimeline
      timeline={{
        status: 'CANCELLED',
        closed: true,
        closedReason: 'Moving house',
        installAppointment: null,
        steps: [
          { status: 'SUBMITTED', label: 'Order placed', state: 'COMPLETE', completedAt: '2026-11-10T10:00:00Z', estimatedAt: null },
          { status: 'VALIDATED', label: 'Order confirmed', state: 'SKIPPED', completedAt: null, estimatedAt: null },
        ],
      }}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('cancelled: Moving house');
  expect(screen.getByText('Not reached')).toBeInTheDocument();
});

describe('useForm', () => {
  const schema = { email: [rules.email()], 'address.city': [rules.required('City')] };

  test('only shows errors after touch or submit, and blocks invalid submits', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useForm({ email: '', address: { city: '' } }, schema));
    expect(result.current.field('email').error).toBeUndefined();
    await act(() => result.current.handleSubmit(onSubmit)());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.field('address.city').error).toBe('City is required.');
  });

  test('maps server field errors onto fields and clears them on edit', async () => {
    const { result } = renderHook(() => useForm({ email: 'a@b.co', address: { city: 'Austin' } }, schema));
    await act(() =>
      result.current.handleSubmit(async () => {
        throw new ApiError({ status: 409, errors: [{ path: 'email', message: 'Already registered.' }] });
      })(),
    );
    expect(result.current.field('email').error).toBe('Already registered.');
    act(() => result.current.setValue('email', 'c@d.co'));
    expect(result.current.field('email').error).toBeUndefined();
  });
});
```

## apps/ecom-gokinetic/client/src/components/ui.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/components/ui.jsx`.

```jsx
import { statusLabel } from '../lib/format';

/** Small presentational building blocks shared by every page. */

export function Field({ label, error, hint, as: Control = 'input', children, ...input }) {
  const describedBy = error ? `${input.id}-error` : hint ? `${input.id}-hint` : undefined;
  if (input.type === 'checkbox') {
    return (
      <div className="field field--checkbox">
        <input {...input} aria-describedby={describedBy} />
        <label htmlFor={input.id}>{label}</label>
        {error && <p className="field__error" id={`${input.id}-error`} role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={input.id}>{label}</label>
      <Control {...input} aria-describedby={describedBy}>
        {children}
      </Control>
      {hint && !error && <p className="field__hint" id={`${input.id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${input.id}-error`} role="alert">{error}</p>}
    </div>
  );
}

export function Button({ pending, children, variant = 'primary', ...rest }) {
  return (
    <button className={`btn btn--${variant}`} disabled={pending || rest.disabled} aria-busy={pending || undefined} {...rest}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="spinner" role="status">
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

const FRIENDLY_TITLES = {
  0: 'You appear to be offline',
  401: 'Please sign in again',
  403: 'You do not have access to this',
  404: 'We could not find that',
  409: 'This changed in the meantime',
  429: 'Too many attempts',
};

/**
 * Renders an ApiError (problem+json) for the shopper. The correlation id is
 * shown for 5xx so support can find the request in Kibana.
 */
export function ProblemAlert({ error, onRetry }) {
  if (!error) return null;
  const title = error.status >= 500 ? 'Something went wrong on our side' : FRIENDLY_TITLES[error.status] || error.title || 'Request failed';
  const retryAfter = error.extensions && error.extensions.retryAfterSeconds;
  return (
    <div className="alert alert--error" role="alert">
      <strong>{title}</strong>
      {error.detail && error.status !== 500 && <p>{error.detail}</p>}
      {retryAfter ? <p>Try again in {retryAfter} seconds.</p> : null}
      {error.status >= 500 && error.correlationId && (
        <p className="alert__reference">Reference: <code>{error.correlationId}</code></p>
      )}
      {onRetry && (
        <button type="button" className="btn btn--link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

const BADGE_TONE = {
  ACTIVE: 'success', PAID: 'success', CONVERTED: 'success', ACCEPTED: 'success',
  CANCELLED: 'muted', VOID: 'muted', EXPIRED: 'muted', REJECTED: 'muted',
  FAILED: 'danger', OVERDUE: 'danger',
  SENT: 'attention', ISSUED: 'attention',
};

export function StatusBadge({ status }) {
  return <span className={`badge badge--${BADGE_TONE[status] || 'info'}`}>{statusLabel(status)}</span>;
}

/** Pager for the API's `{ items, page, pageSize, total }` envelope. */
export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn--secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className="btn btn--secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/context/AuthContext.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/context/AuthContext.jsx`.

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import { createEndpoints } from '../api/endpoints';

/**
 * Session state and the authenticated API.
 *
 * The access token lives only in memory. The rotating refresh token is kept
 * in sessionStorage (cleared when the tab closes) so a reload does not sign
 * the shopper out; it is never put in localStorage.
 */

const REFRESH_KEY = 'gk.refresh';
const AuthContext = createContext(null);

function readRefreshToken() {
  try {
    return window.sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token) {
  try {
    if (token) window.sessionStorage.setItem(REFRESH_KEY, token);
    else window.sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage disabled (private mode): the session simply ends on reload.
  }
}

export function AuthProvider({ children, baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1', fetchImpl }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(readRefreshToken() ? 'restoring' : 'anonymous');
  const accessToken = useRef(null);

  const applySession = useCallback((session) => {
    accessToken.current = session.accessToken;
    writeRefreshToken(session.refreshToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    accessToken.current = null;
    writeRefreshToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  // The refresh call itself must bypass the 401-retry logic, so it uses a
  // bare client with no token.
  const { api, endpoints } = useMemo(() => {
    const bare = createEndpoints(createApiClient({ baseUrl, fetchImpl }));
    const client = createApiClient({
      baseUrl,
      fetchImpl,
      getAccessToken: () => accessToken.current,
      refreshSession: async () => {
        const refreshToken = readRefreshToken();
        if (!refreshToken) return false;
        try {
          applySession(await bare.auth.refresh(refreshToken));
          return true;
        } catch {
          clearSession();
          return false;
        }
      },
    });
    return { api: client, endpoints: createEndpoints(client) };
  }, [baseUrl, fetchImpl, applySession, clearSession]);

  useEffect(() => {
    const refreshToken = readRefreshToken();
    if (!refreshToken) return;
    endpoints.auth
      .refresh(refreshToken)
      .then(applySession)
      .catch(clearSession);
    // Restore once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (credentials) => applySession(await endpoints.auth.login(credentials)), [endpoints, applySession]);
  const register = useCallback(async (details) => applySession(await endpoints.auth.register(details)), [endpoints, applySession]);
  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken();
    clearSession();
    if (refreshToken) await endpoints.auth.logout(refreshToken).catch(() => {});
  }, [endpoints, clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isBusiness: Boolean(user && user.segment === 'BUSINESS'),
      hasRole: (...roles) => Boolean(user && user.roles.some((r) => roles.includes(r))),
      login,
      register,
      logout,
      api,
      endpoints,
    }),
    [user, status, login, register, logout, api, endpoints],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
```

## apps/ecom-gokinetic/client/src/context/CartContext.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/context/CartContext.jsx`.

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Shopping cart state shared across the storefront.
 *
 * The cart id and (for guests) its access token persist in localStorage so a
 * shopper can come back to the same cart. After sign-in the guest cart is
 * claimed, which merges it into any cart the user already has.
 */

const STORAGE_KEY = 'gk.cart';
const CartContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-persistent cart is acceptable.
  }
}

/** Problems that mean the stored cart is gone for good. */
const DEAD_CART = (err) => err && (err.status === 404 || err.status === 403 || err.code === 'CART_CLOSED');

export function CartProvider({ children }) {
  const { endpoints, isAuthenticated, user } = useAuth();
  const [cart, setCart] = useState(null);
  const [pending, setPending] = useState(false);
  const ref = useRef(readStored());

  const remember = useCallback((next, guestToken) => {
    ref.current = next ? { cartId: next.id, guestToken: guestToken ?? ref.current?.guestToken ?? null, segment: next.segment } : null;
    writeStored(ref.current);
    setCart(next);
  }, []);

  const reset = useCallback(() => remember(null), [remember]);

  // Load the stored cart on mount, claim it after login.
  useEffect(() => {
    const stored = ref.current;
    if (!stored) return;
    const load = isAuthenticated && stored.guestToken
      ? endpoints.carts.claim(stored.cartId, stored.guestToken).then((c) => remember(c, null))
      : endpoints.carts.get(stored.cartId, stored.guestToken).then((c) => remember(c));
    load.catch((err) => {
      if (DEAD_CART(err)) reset();
    });
  }, [isAuthenticated, endpoints, remember, reset]);

  /** Returns the current cart id, creating a cart for `segment` on first use. */
  const ensureCart = useCallback(
    async (segment) => {
      const stored = ref.current;
      if (stored && stored.segment === segment) return stored;
      const { cart: created, guestToken } = await endpoints.carts.create(segment);
      remember(created, guestToken);
      return ref.current;
    },
    [endpoints, remember],
  );

  /** Wraps a cart mutation: tracks pending state and recovers from a dead cart. */
  const run = useCallback(
    async (operation) => {
      setPending(true);
      try {
        const { cartId, guestToken } = ref.current;
        const next = await operation(cartId, guestToken);
        remember(next);
        return next;
      } catch (err) {
        if (DEAD_CART(err)) reset();
        throw err;
      } finally {
        setPending(false);
      }
    },
    [remember, reset],
  );

  const segmentFor = useCallback(() => (user && user.segment) || ref.current?.segment || 'CONSUMER', [user]);

  const value = useMemo(
    () => ({
      cart,
      pending,
      itemCount: cart ? cart.items.reduce((n, i) => n + i.quantity, 0) : 0,
      async addItem(sku, quantity = 1, segment = segmentFor()) {
        await ensureCart(segment);
        return run((id, token) => endpoints.carts.addItem(id, token, sku, quantity));
      },
      updateQuantity: (sku, quantity) => run((id, token) => endpoints.carts.updateItem(id, token, sku, quantity)),
      removeItem: (sku) => run((id, token) => endpoints.carts.removeItem(id, token, sku)),
      setTerm: (months) => run((id, token) => endpoints.carts.setTerm(id, token, months)),
      async setAddress(address, segment = segmentFor()) {
        await ensureCart(segment);
        return run((id, token) => endpoints.carts.setAddress(id, token, address));
      },
      applyPromo: (code) => run((id, token) => endpoints.carts.applyPromo(id, token, code)),
      removePromo: () => run((id, token) => endpoints.carts.removePromo(id, token)),
      refresh: () => run((id, token) => endpoints.carts.get(id, token)),
      /** Called after a successful order: the server has closed the cart. */
      clear: reset,
    }),
    [cart, pending, ensureCart, run, endpoints, reset, segmentFor],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
```

## apps/ecom-gokinetic/client/src/hooks/useAsync.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/hooks/useAsync.js`.

```javascript
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with a promise-returning function and tracks
 * `{ data, error, loading }`. Re-runs when `deps` change; responses from
 * superseded runs are ignored so fast filter changes cannot show stale data.
 *
 * @param {() => Promise<T>} fn
 * @param {unknown[]} deps
 * @param {{ enabled?: boolean }} [options]
 */
export function useAsync(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const runId = useRef(0);

  const run = useCallback(() => {
    const id = runId.current + 1;
    runId.current = id;
    setState((s) => ({ ...s, loading: true, error: null }));
    return fn().then(
      (data) => {
        if (runId.current === id) setState({ data, error: null, loading: false });
        return data;
      },
      (error) => {
        if (runId.current === id) setState((s) => ({ ...s, error, loading: false }));
        return undefined;
      },
    );
    // `fn` is intentionally excluded: callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) run();
    return () => {
      runId.current += 1;
    };
  }, [run, enabled]);

  const setData = useCallback((data) => setState((s) => ({ ...s, data })), []);
  return { ...state, reload: run, setData };
}

/**
 * Wraps an action (button click / form submit): exposes `pending` and the
 * last `error`, and prevents double submission.
 */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const execute = useCallback(
    async (...args) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fn],
  );

  return { execute, pending, error, clearError: () => setError(null) };
}
```

## apps/ecom-gokinetic/client/src/hooks/useAvailability.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/hooks/useAvailability.js`.

```javascript
import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'gk.availability';

function readStored() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY));
    // Checks expire server-side; drop ours at the same moment.
    return stored && new Date(stored.check.expiresAt) > new Date() ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The shopper's latest address availability check, shared by the plan
 * list, comparison and cart pages for the browser session.
 */
export function useAvailability() {
  const { endpoints } = useAuth();
  const [state, setState] = useState(readStored);

  const check = useCallback(
    async (address, segment) => {
      const result = await endpoints.serviceability.check(address, segment);
      const next = { address, check: result };
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Fine: the result just is not remembered across pages.
      }
      setState(next);
      return result;
    },
    [endpoints],
  );

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setState(null);
  }, []);

  return {
    address: state ? state.address : null,
    check: state ? state.check : null,
    isAvailable: (sku) => Boolean(state && state.check.availablePlanSkus.includes(sku)),
    runCheck: check,
    clear,
  };
}
```

## apps/ecom-gokinetic/client/src/hooks/useForm.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/hooks/useForm.js`.

```javascript
import { useCallback, useState } from 'react';
import { validateValues } from '../lib/validation';

function setPath(obj, path, value) {
  const keys = path.split('.');
  const copy = { ...obj };
  let node = copy;
  keys.slice(0, -1).forEach((key) => {
    node[key] = { ...(node[key] || {}) };
    node = node[key];
  });
  node[keys[keys.length - 1]] = value;
  return copy;
}

function getPath(obj, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

/**
 * Controlled form state with schema validation.
 *
 * - errors appear for a field once it has been touched or a submit was tried
 * - `handleSubmit` validates everything, then calls `onSubmit(values)`; if it
 *   throws an ApiError with field errors those are shown next to the fields
 *
 * @param {object} initialValues
 * @param {Record<string, Function[]>} schema see lib/validation
 */
export function useForm(initialValues, schema = {}) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const clientErrors = validateValues(schema, values);
  const errors = { ...clientErrors, ...serverErrors };
  const visibleError = (name) => (submitted || touched[name] ? errors[name] : undefined);

  const setValue = useCallback((name, value) => {
    setValues((v) => setPath(v, name, value));
    setServerErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _removed, ...rest } = e;
      return rest;
    });
  }, []);

  const field = (name, { type = 'text' } = {}) => ({
    name,
    id: `field-${name.replace(/\./g, '-')}`,
    ...(type === 'checkbox' ? { checked: Boolean(getPath(values, name)) } : { value: getPath(values, name) ?? '' }),
    onChange: (e) => setValue(name, type === 'checkbox' ? e.target.checked : e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    'aria-invalid': visibleError(name) ? 'true' : undefined,
    error: visibleError(name),
  });

  const handleSubmit = (onSubmit) => async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(validateValues(schema, values)).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err && Array.isArray(err.errors) && err.errors.length) {
        setServerErrors(Object.fromEntries(err.errors.map((e) => [e.path.replace(/^body\./, ''), e.message])));
      }
      setFormError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = (next = initialValues) => {
    setValues(next);
    setTouched({});
    setServerErrors({});
    setSubmitted(false);
    setFormError(null);
  };

  return {
    values,
    errors,
    isValid: Object.keys(clientErrors).length === 0,
    field,
    setValue,
    handleSubmit,
    submitting,
    formError,
    reset,
  };
}
```

## apps/ecom-gokinetic/client/src/lib/format.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/lib/format.js`.

```javascript
/**
 * Display formatting. The API always sends integer minor units and ISO-8601
 * UTC strings; conversion to dollars/local dates happens only here, at the
 * edge, and never feeds back into arithmetic.
 */

const currencyFormatters = new Map();

function currencyFormatter(currency) {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }));
  }
  return currencyFormatters.get(currency);
}

/** @param {number} minor integer cents */
export function formatMoney(minor, currency = 'USD') {
  if (!Number.isSafeInteger(minor)) return '-';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  // Build the decimal string from integers to avoid float artefacts.
  const decimal = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return `${sign}${currencyFormatter(currency).format(Number(decimal))}`;
}

export function formatMonthly(minor, currency) {
  return `${formatMoney(minor, currency)}/mo`;
}

export function formatSpeed(mbps) {
  if (!mbps) return '-';
  return mbps >= 1000 && mbps % 1000 === 0 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`;
}

export function formatDate(iso, options = { dateStyle: 'medium' }) {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('en-US', options).format(date);
}

/** Formats a calendar date (YYYY-MM-DD) without shifting it into the local timezone. */
export function formatCalendarDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatAddress(address) {
  if (!address) return '';
  return [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`].filter(Boolean).join(', ');
}

export function formatTerm(months) {
  return months === 0 ? 'No contract' : `${months}-month contract`;
}

const STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Order placed',
  VALIDATED: 'Confirmed',
  PROVISIONING: 'Installation scheduled',
  ACTIVE: 'Active',
  CANCELLED: 'Cancelled',
  FAILED: 'Could not complete',
  REQUESTED: 'Requested',
  PRICED: 'Being prepared',
  PENDING_APPROVAL: 'Being prepared',
  SENT: 'Ready to review',
  ACCEPTED: 'Accepted',
  REJECTED: 'Declined',
  EXPIRED: 'Expired',
  CONVERTED: 'Ordered',
  ISSUED: 'Due',
  PAID: 'Paid',
  VOID: 'Void',
  OVERDUE: 'Overdue',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}
```

## apps/ecom-gokinetic/client/src/lib/lib.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/lib/lib.test.js`.

```javascript
import { describe, expect, test } from 'vitest';
import { formatMoney, formatSpeed, formatCalendarDate, formatTerm, statusLabel } from './format';
import { addressSchema, normalizePhone, rules, validateValues } from './validation';
import { parseSiteList, volumeTier } from './sites';
import { cardBrand, luhnValid, validateCard } from './paymentTokenizer';

describe('format', () => {
  test.each([
    [0, '$0.00'],
    [8075, '$80.75'],
    [123456789, '$1,234,567.89'],
    [-990, '-$9.90'],
  ])('formatMoney(%i) = %s', (minor, text) => {
    expect(formatMoney(minor)).toBe(text);
  });

  test('refuses non-integer money', () => {
    expect(formatMoney(10.5)).toBe('-');
  });

  test('speeds, terms, calendar dates and statuses', () => {
    expect(formatSpeed(2000)).toBe('2 Gbps');
    expect(formatSpeed(500)).toBe('500 Mbps');
    expect(formatTerm(0)).toBe('No contract');
    expect(formatTerm(24)).toBe('24-month contract');
    expect(formatCalendarDate('2026-11-27')).toBe('Fri, Nov 27');
    expect(statusLabel('PROVISIONING')).toBe('Installation scheduled');
  });
});

describe('validation', () => {
  test('address schema reports the first failing rule per field', () => {
    const errors = validateValues(addressSchema('address'), { address: { line1: '1', city: 'Austin', state: 'XX', postalCode: '7870' } });
    expect(errors).toEqual({
      'address.line1': 'Street address must be at least 3 characters.',
      'address.state': 'Choose a state.',
      'address.postalCode': 'Enter a 5-digit ZIP code.',
    });
  });

  test('password and confirmation rules', () => {
    const schema = { password: [rules.password()], confirm: [rules.matches('password', 'Mismatch')] };
    expect(validateValues(schema, { password: 'short', confirm: 'short' })).toEqual({ password: 'Use at least 10 characters.' });
    expect(validateValues(schema, { password: 'Long-enough-1', confirm: 'other' })).toEqual({ confirm: 'Mismatch' });
  });

  test('phone numbers are normalised to 10 digits', () => {
    expect(normalizePhone('+1 (512) 555-0100')).toBe('5125550100');
    expect(rules.phone()('(512) 555-0100')).toBeNull();
  });
});

describe('parseSiteList', () => {
  test('parses CSV and TSV rows, skipping the header, duplicates and bad rows', () => {
    const text = [
      'Street,Unit,City,State,ZIP',
      '12 Main St,,Austin,TX,78701',
      '"400 Congress Ave, Floor 3",Ste 300,Austin,tx,78701',
      '12 Main St,,Austin,TX,78701',
      '9 Elm St\tDallas\tTX\t75201',
      'Nowhere Rd,Somewhere,ZZ,00000',
      'just one cell',
    ].join('\n');
    const { sites, problems } = parseSiteList(text);
    expect(sites).toHaveLength(3);
    expect(sites[1]).toEqual({ line1: '400 Congress Ave, Floor 3', line2: 'Ste 300', city: 'Austin', state: 'TX', postalCode: '78701' });
    expect(problems.map((p) => p.line)).toEqual([4, 6, 7]);
  });

  test('caps the number of sites', () => {
    const text = Array.from({ length: 5 }, (_, i) => `${i + 10} Main St,Austin,TX,78701`).join('\n');
    const { sites, problems } = parseSiteList(text, { maxSites: 3 });
    expect(sites).toHaveLength(3);
    expect(problems[0].message).toMatch(/at most 3 sites/);
  });

  test('volume tiers mirror the server', () => {
    expect(volumeTier(3)).toEqual({ discountPercent: 0, nextTier: { sitesNeeded: 2, discountPercent: 5 } });
    expect(volumeTier(12)).toEqual({ discountPercent: 10, nextTier: { sitesNeeded: 13, discountPercent: 15 } });
    expect(volumeTier(30).nextTier).toBeNull();
  });
});

describe('card checks', () => {
  test('luhn and brand detection', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4242 4242 4242 4241')).toBe(false);
    expect(cardBrand('378282246310005')).toBe('amex');
  });

  test('validateCard checks expiry and amex CVC length', () => {
    const now = new Date('2026-11-11T00:00:00Z');
    expect(validateCard({ number: '4242424242424242', expiry: '11/26', cvc: '123', postalCode: '78701' }, now)).toEqual({});
    expect(validateCard({ number: '4242424242424242', expiry: '10/26', cvc: '123', postalCode: '78701' }, now)).toEqual({
      expiry: 'This card has expired.',
    });
    expect(validateCard({ number: '378282246310005', expiry: '01/30', cvc: '123', postalCode: '7870' }, now)).toEqual({
      cvc: 'Enter the 4-digit security code.',
      postalCode: 'Enter the billing ZIP code.',
    });
  });
});
```

## apps/ecom-gokinetic/client/src/lib/paymentTokenizer.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/lib/paymentTokenizer.js`.

```javascript
/**
 * Card tokenisation against the payment gateway's public endpoint.
 *
 * Card numbers go straight from the browser to the gateway with the
 * publishable key and never reach the GoKinetic API, which only receives
 * the opaque token (keeps the storefront out of PCI DSS scope for card data).
 */

const TOKENIZE_URL = import.meta.env.VITE_PAYMENT_TOKENIZE_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_PAYMENT_PUBLISHABLE_KEY;

/** Luhn checksum used for instant feedback before calling the gateway. */
export function luhnValid(number) {
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number) {
  const digits = String(number).replace(/\D/g, '');
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(011|5)/.test(digits)) return 'discover';
  return 'unknown';
}

/** Returns field errors for the card form, or {} when it can be submitted. */
export function validateCard({ number, expiry, cvc, postalCode }, now = new Date()) {
  const errors = {};
  if (!luhnValid(number)) errors.number = 'Enter a valid card number.';
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry || '').trim());
  if (!match) {
    errors.expiry = 'Use MM/YY.';
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const endOfMonth = new Date(Date.UTC(year, month, 1));
    if (month < 1 || month > 12) errors.expiry = 'Use MM/YY.';
    else if (endOfMonth <= now) errors.expiry = 'This card has expired.';
  }
  const cvcLength = cardBrand(number) === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(String(cvc || ''))) errors.cvc = `Enter the ${cvcLength}-digit security code.`;
  if (!/^\d{5}$/.test(String(postalCode || ''))) errors.postalCode = 'Enter the billing ZIP code.';
  return errors;
}

/**
 * @returns {Promise<{token: string, last4: string, brand: string}>}
 */
export async function tokenizeCard(card, { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  if (!TOKENIZE_URL || !PUBLISHABLE_KEY) {
    throw new Error('Card payments are not configured for this environment.');
  }
  const [month, year] = card.expiry.split('/').map((s) => s.trim());
  const response = await fetchImpl(TOKENIZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUBLISHABLE_KEY}` },
    body: JSON.stringify({
      card: { number: card.number.replace(/\D/g, ''), exp_month: Number(month), exp_year: 2000 + Number(year), cvc: card.cvc },
      billing: { postal_code: card.postalCode },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    throw new Error(body.error?.message || 'Your card could not be verified. Check the details and try again.');
  }
  return { token: body.id, last4: body.card?.last4 || card.number.slice(-4), brand: body.card?.brand || cardBrand(card.number) };
}
```

## apps/ecom-gokinetic/client/src/lib/sites.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/lib/sites.js`.

```javascript
import { addressSchema, trimAddress, validateValues } from './validation';

/**
 * Parses a pasted site list for Business GoKinetic multi-site quotes.
 *
 * Accepts CSV or tab-separated rows (as copied from a spreadsheet) with the
 * columns: street, unit (optional), city, state, ZIP. A header row is
 * detected and skipped. Duplicate sites are dropped so the volume tier is
 * not inflated by accident.
 *
 * @returns {{ sites: object[], problems: Array<{line: number, message: string}> }}
 */
export function parseSiteList(text, { maxSites = 200 } = {}) {
  const sites = [];
  const problems = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim();
    if (!line) return;
    const cells = splitRow(line);
    if (index === 0 && /street|address/i.test(cells[0] || '')) return;

    let address;
    if (cells.length === 5) {
      address = { line1: cells[0], line2: cells[1], city: cells[2], state: cells[3], postalCode: cells[4] };
    } else if (cells.length === 4) {
      address = { line1: cells[0], line2: '', city: cells[1], state: cells[2], postalCode: cells[3] };
    } else {
      problems.push({ line: lineNo, message: 'Expected street, [unit], city, state, ZIP.' });
      return;
    }

    const errors = validateValues(addressSchema(''), address);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      problems.push({ line: lineNo, message: firstError });
      return;
    }
    const clean = trimAddress(address);
    const key = [clean.line1, clean.line2 || '', clean.city, clean.state, clean.postalCode.slice(0, 5)].join('|').toUpperCase();
    if (seen.has(key)) {
      problems.push({ line: lineNo, message: 'Duplicate site skipped.' });
      return;
    }
    seen.add(key);
    sites.push(clean);
  });

  if (sites.length > maxSites) {
    problems.push({ line: 0, message: `A quote can include at most ${maxSites} sites; split the rest into another quote.` });
    sites.length = maxSites;
  }
  return { sites, problems };
}

/** Splits one CSV/TSV row, honouring double-quoted cells containing commas. */
function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Mirrors the server's Business GoKinetic volume tiers for the live estimate. */
const VOLUME_TIERS = [
  { minSites: 25, discountBps: 1500 },
  { minSites: 10, discountBps: 1000 },
  { minSites: 5, discountBps: 500 },
];

export function volumeTier(siteCount) {
  const tier = VOLUME_TIERS.find((t) => siteCount >= t.minSites);
  const next = [...VOLUME_TIERS].reverse().find((t) => siteCount < t.minSites);
  return {
    discountPercent: tier ? tier.discountBps / 100 : 0,
    nextTier: next ? { sitesNeeded: next.minSites - siteCount, discountPercent: next.discountBps / 100 } : null,
  };
}
```

## apps/ecom-gokinetic/client/src/lib/validation.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/lib/validation.js`.

```javascript
/**
 * Client-side form validation mirroring the API's boundary rules, so most
 * mistakes are caught before a round trip. The server remains the source of
 * truth: its problem+json field errors are merged into the same shape.
 *
 * Validators return an error message string or null.
 */

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];

const STATE_SET = new Set(US_STATES);

export const rules = {
  required: (label) => (v) => (String(v ?? '').trim() ? null : `${label} is required.`),
  minLength: (n, label) => (v) => (String(v ?? '').trim().length >= n ? null : `${label} must be at least ${n} characters.`),
  email: () => (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) ? null : 'Enter a valid email address.'),
  phone: () => (v) => (/^\+?1?\d{10}$/.test(String(v ?? '').replace(/[\s().-]/g, '')) ? null : 'Enter a 10-digit US phone number.'),
  zip: () => (v) => (/^\d{5}(-\d{4})?$/.test(String(v ?? '').trim()) ? null : 'Enter a 5-digit ZIP code.'),
  state: () => (v) => (STATE_SET.has(String(v ?? '').trim().toUpperCase()) ? null : 'Choose a state.'),
  password: () => (v) => {
    const s = String(v ?? '');
    if (s.length < 10) return 'Use at least 10 characters.';
    if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) return 'Include upper and lower case letters and a digit.';
    return null;
  },
  matches: (otherField, message) => (v, values) => (v === values[otherField] ? null : message),
  checked: (message) => (v) => (v === true ? null : message),
};

/**
 * Runs a schema `{ field: [rule, ...] }` (dotted paths supported) and returns
 * `{ 'field': message }` for the first failing rule of each field.
 */
export function validateValues(schema, values) {
  const errors = {};
  for (const [path, fieldRules] of Object.entries(schema)) {
    const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), values);
    for (const rule of fieldRules) {
      const message = rule(value, values);
      if (message) {
        errors[path] = message;
        break;
      }
    }
  }
  return errors;
}

/** Schema for an address nested under `prefix` (e.g. "address"). */
export function addressSchema(prefix = 'address') {
  const p = prefix ? `${prefix}.` : '';
  return {
    [`${p}line1`]: [rules.required('Street address'), rules.minLength(3, 'Street address')],
    [`${p}city`]: [rules.required('City'), rules.minLength(2, 'City')],
    [`${p}state`]: [rules.state()],
    [`${p}postalCode`]: [rules.zip()],
  };
}

/** Normalises a phone number to the digits-only form the API expects. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function trimAddress(address) {
  return {
    line1: address.line1.trim(),
    ...(address.line2 && address.line2.trim() ? { line2: address.line2.trim() } : {}),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
    postalCode: address.postalCode.trim(),
  };
}
```

## apps/ecom-gokinetic/client/src/main.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/main.jsx`.

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

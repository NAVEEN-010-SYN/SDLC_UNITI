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

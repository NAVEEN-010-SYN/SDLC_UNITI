'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createWorld, principals } = require('./support/world');
const { ADDRESS } = require('./support/fakes');

/**
 * HTTP-level tests: routing, validation, auth, problem+json rendering and
 * header contracts, over the real service graph with in-memory storage.
 */
describe('API /api/v1', () => {
  let world;
  let app;
  const bearer = (principal) => `Bearer ${world.services.authService.signAccessToken({ ...principal, _id: principal.id })}`;

  beforeEach(() => {
    world = createWorld();
    app = createApp({ container: world });
  });

  test('health echoes a supplied correlation id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Correlation-Id', 'trace-12345678');
    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('trace-12345678');
    expect(res.body.status).toBe('UP');
  });

  test('validation failures are RFC 7807 problems', async () => {
    const res = await request(app).get('/api/v1/products?pageSize=500');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    const body = JSON.parse(res.text);
    expect(body).toMatchObject({ status: 400, title: 'Request validation failed', instance: '/api/v1/products?pageSize=500' });
    expect(body.errors).toEqual([{ path: 'query.pageSize', message: 'Must be at most 100.' }]);
    expect(body.correlationId).toBe(res.headers['x-correlation-id']);
  });

  test('unknown routes and missing auth are problems too', async () => {
    expect((await request(app).get('/api/v1/nope')).status).toBe(404);
    const res = await request(app).get('/api/v1/orders');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.text).type).toMatch(/\/unauthorized$/);
  });

  test('roles are enforced server-side', async () => {
    const res = await request(app)
      .put('/api/v1/products/GK-NEW-PLAN')
      .set('Authorization', bearer(principals.consumer))
      .send({});
    expect(res.status).toBe(403);
  });

  test('catalogue lists only plans the address qualifies for', async () => {
    const check = await request(app).post('/api/v1/serviceability/checks').send({ address: ADDRESS });
    expect(check.status).toBe(201);
    expect(check.headers.location).toBe(`/api/v1/serviceability/checks/${check.body.checkId}`);
    const res = await request(app).get(`/api/v1/products?segment=CONSUMER&serviceabilityCheckId=${check.body.checkId}`);
    expect(res.body.items.map((p) => p.sku)).toEqual(['GK-FIBRE-500', 'GK-FIBRE-1000']);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('guest cart flow uses the cart token header', async () => {
    const created = await request(app).post('/api/v1/carts').send({ segment: 'CONSUMER' });
    expect(created.status).toBe(201);
    const token = created.headers['x-cart-token'];
    const id = created.body.id;

    const denied = await request(app).post(`/api/v1/carts/${id}/items`).send({ sku: 'GK-FIBRE-1000' });
    expect(denied.status).toBe(403);

    const added = await request(app).post(`/api/v1/carts/${id}/items`).set('X-Cart-Token', token).send({ sku: 'gk-fibre-1000' });
    expect(added.status).toBe(200);
    expect(added.body.items[0]).toMatchObject({ sku: 'GK-FIBRE-1000', quantity: 1 });
  });

  test('checkout requires an Idempotency-Key and replays duplicates', async () => {
    const auth = bearer(principals.consumer);
    const cart = (await request(app).post('/api/v1/carts').set('Authorization', auth).send({ segment: 'CONSUMER' })).body;
    await request(app).post(`/api/v1/carts/${cart.id}/items`).set('Authorization', auth).send({ sku: 'GK-FIBRE-1000' });
    await request(app).put(`/api/v1/carts/${cart.id}/address`).set('Authorization', auth).send({ address: ADDRESS });
    const body = {
      cartId: cart.id,
      paymentToken: 'tok_visa_4242',
      contact: { email: 'ada@example.com', phone: '5125550100', firstName: 'Ada', lastName: 'Lovelace' },
      acceptTerms: true,
    };

    const missing = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).send(body);
    expect(missing.status).toBe(400);

    const key = 'checkout-key-0001-abcdef';
    const first = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    expect(first.headers.location).toBe(`/api/v1/orders/${first.body.orderNumber}`);

    const replay = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).set('Idempotency-Key', key).send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.orderNumber).toBe(first.body.orderNumber);
    expect(world.repos.orders.rows.size).toBe(1);
  });

  test('install slots are offered for a qualified address', async () => {
    const check = await request(app).post('/api/v1/serviceability/checks').send({ address: ADDRESS });
    const res = await request(app).get(`/api/v1/serviceability/checks/${check.body.checkId}/install-slots?days=3`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(3);
    expect(res.body.slots[0].windows[0]).toHaveProperty('startsAt');
  });
});

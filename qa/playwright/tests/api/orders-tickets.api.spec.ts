import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { ApiClient, ApiError } from '../../src/api/apiClient';
import { SeedApi } from '../../src/api/seedApi';
import { Order, Ticket } from '../../src/api/domain';
import { AddressBuilder, OrderBuilder, TicketBuilder } from '../../src/data/builders';
import { expectSchema } from '../../src/support/schema';

/**
 * Contract-level API checks that complement the Postman collections: schema
 * conformance, problem+json errors, pagination envelope and correlation-id echo.
 */
const ACCOUNT_ID = process.env.API_TEST_ACCOUNT_ID ?? 'ACC-00010042';

test.describe('Orders API @api', () => {
  let api: ApiClient;
  let seed: SeedApi;
  const created: string[] = [];

  test.beforeAll(async () => {
    api = await ApiClient.create();
    seed = new SeedApi(api);
  });

  test.afterAll(async () => {
    for (const id of created) {
      await seed.cancelOrder(id).catch(() => undefined);
    }
    await api.dispose();
  });

  test('POST /orders returns 201 with a schema-valid order', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).withPlan('FIB-1000').build());
    created.push(order.id);
    expectSchema('order', order);
    expect(order.status).toBe('SUBMITTED');
  });

  test('order total is integer minor units and matches line pricing', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).withPlan('FIB-500').withAddOn('STATIC-IP').build());
    created.push(order.id);
    const products = await seed.listProducts('B2C');
    const priceOf = (sku: string) => products.items.find((p) => p.sku === sku)?.monthlyPrice.amountMinor ?? 0;
    const expected = order.lines.reduce((sum, line) => sum + priceOf(line.sku) * line.quantity, 0);
    expect(Number.isInteger(order.total.amountMinor)).toBe(true);
    expect(order.total.amountMinor).toBe(expected);
  });

  test('out-of-footprint address is rejected with 422 problem+json', async () => {
    const draft = OrderBuilder.forAccount(ACCOUNT_ID).at(AddressBuilder.outOfFootprint().build()).build();
    const response = await api.raw('POST', '/api/v1/orders', { body: draft });
    expect(response.status()).toBe(422);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    const problem = await response.json();
    expectSchema('problem', problem);
    expect(problem.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'serviceAddress' })]));
  });

  test('missing lines fails validation at the boundary', async () => {
    const draft = { ...OrderBuilder.forAccount(ACCOUNT_ID).build(), lines: [] };
    const error = await seed.createOrder(draft).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  test('cancelling a submitted order moves it to CANCELLED', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).build());
    const cancelled: Order = await seed.cancelOrder(order.id);
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('correlation id supplied by the caller is echoed back', async () => {
    const correlationId = randomUUID();
    const response = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, {
      correlationId,
      query: { page: 1, pageSize: 5 },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['x-correlation-id']).toBe(correlationId);
  });

  test('order list honours the pagination envelope and bounds', async () => {
    const response = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, { query: { page: 1, pageSize: 2 } });
    const body = await response.json();
    expectSchema('page', body);
    expect(body.items.length).toBeLessThanOrEqual(2);

    const tooLarge = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, { query: { page: 1, pageSize: 1000 } });
    expect(tooLarge.status()).toBe(400);
  });
});

test.describe('Tickets API @api', () => {
  let api: ApiClient;
  let seed: SeedApi;

  test.beforeAll(async () => {
    api = await ApiClient.create();
    seed = new SeedApi(api);
  });

  test.afterAll(async () => api.dispose());

  test('ticket lifecycle transitions are enforced', async () => {
    const ticket: Ticket = await seed.createTicket(ACCOUNT_ID, TicketBuilder.connectivity().build());
    expectSchema('ticket', ticket);

    const invalid = await api.raw('PATCH', `/api/v1/tickets/${ticket.id}`, { body: { status: 'PENDING_CUSTOMER' } });
    expect(invalid.status(), 'OPEN -> PENDING_CUSTOMER skips IN_PROGRESS').toBe(409);
    expectSchema('problem', await invalid.json());

    const closed = await seed.closeTicket(ticket.id);
    expect(closed.status).toBe('CLOSED');
  });

  test('unauthenticated request returns 401 problem+json', async ({ request }) => {
    const response = await request.get(`/api/v1/accounts/${ACCOUNT_ID}/tickets`);
    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toContain('Bearer');
  });
});

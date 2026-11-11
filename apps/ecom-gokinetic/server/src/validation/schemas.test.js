'use strict';

const { validate } = require('./validator');
const schemas = require('./schemas');

const ADDRESS = { line1: '12 Main Street', city: 'Austin', state: 'tx', postalCode: '78701' };

describe('validator primitives via schemas', () => {
  test('coerces query strings and applies defaults', () => {
    const { value, errors } = validate(schemas.catalog.list, { page: '2', minSpeedMbps: '500' });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ page: 2, pageSize: 20, minSpeedMbps: 500, sort: 'price' });
  });

  test('rejects unknown fields and reports nested paths', () => {
    const { errors } = validate(schemas.serviceability.check, { address: { ...ADDRESS, postalCode: '7870' }, extra: 1 });
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: 'address.postalCode', message: 'Has an invalid format.' },
        { path: 'extra', message: 'Is not an allowed field.' },
      ]),
    );
  });

  test('normalises state codes and refuses unknown states', () => {
    expect(validate(schemas.cart.setAddress, { address: ADDRESS }).value.address.state).toBe('TX');
    const { errors } = validate(schemas.cart.setAddress, { address: { ...ADDRESS, state: 'ZZ' } });
    expect(errors).toEqual([{ path: 'address.state', message: 'Must be a valid US state code.' }]);
  });

  test('passwords need mixed case and a digit', () => {
    const base = { email: 'A@Example.com', firstName: 'A', lastName: 'B' };
    expect(validate(schemas.auth.register, { ...base, password: 'alllowercase1' }).errors[0].path).toBe('password');
    const ok = validate(schemas.auth.register, { ...base, password: 'Mixed-Case-123' });
    expect(ok.errors).toEqual([]);
    expect(ok.value.email).toBe('a@example.com');
    expect(ok.value.segment).toBe('CONSUMER');
  });

  test('checkout requires accepted terms and parses the install date', () => {
    const body = {
      cartId: 'a'.repeat(24),
      paymentToken: 'tok_12345678',
      contact: { email: 'a@b.co', phone: '5125550100', firstName: 'A', lastName: 'B' },
      preferredInstallDate: '2026-12-01T13:00:00Z',
      acceptTerms: false,
    };
    const { value, errors } = validate(schemas.checkout.placeOrder, body);
    expect(errors).toEqual([{ path: 'acceptTerms', message: 'Terms and conditions must be accepted.' }]);
    expect(validate(schemas.checkout.placeOrder, { ...body, acceptTerms: true }).value.preferredInstallDate).toBeInstanceOf(Date);
    expect(value.preferredInstallDate).toBeInstanceOf(Date);
  });

  test('compare accepts a comma-separated SKU list', () => {
    expect(validate(schemas.catalog.compare, { skus: 'gk-fibre-500,GK-FIBRE-1000' }).errors).toEqual([]);
    expect(validate(schemas.catalog.compare, { skus: 'GK-FIBRE-500,<script>' }).errors).toHaveLength(1);
  });

  test('quote requests bound sites and items', () => {
    const { errors } = validate(schemas.quotes.request, {
      companyName: 'Acme',
      contactEmail: 'ops@acme.example',
      items: [],
      sites: [ADDRESS],
    });
    expect(errors).toEqual([{ path: 'items', message: 'Must contain at least 1 item(s).' }]);
  });
});

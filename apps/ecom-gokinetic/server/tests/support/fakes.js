'use strict';

/**
 * In-memory implementations of the repository and integration contracts,
 * used by service and API tests so business logic can be exercised without
 * MongoDB or network access. Each mirrors the semantics the services rely
 * on (versioned updates, compare-and-set transitions, unique keys).
 */

const crypto = require('node:crypto');

const clone = (value) => (value === undefined ? value : structuredClone(value));
const newId = () => crypto.randomBytes(12).toString('hex');

/** Applies `{ 'a.b': 1, c: 2 }` style patches, as Mongo's $set does. */
function applySet(target, patch) {
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.');
    let node = target;
    keys.slice(0, -1).forEach((k) => {
      node[k] = node[k] && typeof node[k] === 'object' ? node[k] : {};
      node = node[k];
    });
    node[keys[keys.length - 1]] = value;
  }
  return target;
}

function paginateArray(items, { page = 1, pageSize = 20 }) {
  const start = (page - 1) * pageSize;
  return { items: clone(items.slice(start, start + pageSize)), page, pageSize, total: items.length };
}

function memoryProducts(seed = []) {
  const rows = seed.map((p) => ({
    id: newId(),
    description: '',
    oneTimePrice: 0,
    installationFee: 0,
    monthlyPrice: 0,
    requiresPlan: false,
    compatiblePlanSkus: [],
    maxQuantity: 1,
    active: true,
    features: [],
    technology: 'FTTP',
    ...p,
  }));
  const find = (sku) => rows.find((p) => p.sku === sku);
  return {
    rows,
    async findBySku(sku) {
      return clone(find(sku.toUpperCase()) || null);
    },
    async findActiveBySkus(skus) {
      return clone(rows.filter((p) => p.active && skus.includes(p.sku)));
    },
    async list(criteria, { page, pageSize, sort }) {
      let out = rows.filter((p) => criteria.includeInactive || p.active);
      if (criteria.segment) out = out.filter((p) => p.segments.includes(criteria.segment));
      if (criteria.type) out = out.filter((p) => p.type === criteria.type);
      if (criteria.onlySkus) out = out.filter((p) => criteria.onlySkus.includes(p.sku));
      if (sort === 'speed') out = [...out].sort((a, b) => (a.speedMbps || 0) - (b.speedMbps || 0));
      return paginateArray(out, { page, pageSize });
    },
    async listCompatibleAddons(planSku, segment) {
      return clone(
        rows.filter(
          (p) =>
            p.active &&
            p.segments.includes(segment) &&
            p.type !== 'PLAN' &&
            (p.compatiblePlanSkus.length === 0 || p.compatiblePlanSkus.includes(planSku)),
        ),
      );
    },
    async upsert(product) {
      const existing = find(product.sku);
      if (existing) Object.assign(existing, product);
      else rows.push({ id: newId(), ...product });
      return clone(find(product.sku));
    },
    async deactivate(sku) {
      const p = find(sku);
      if (!p) return null;
      p.active = false;
      return clone(p);
    },
    async reserveStock(sku, quantity) {
      const p = find(sku);
      if (!p || p.stockOnHand == null) return true;
      if (p.stockOnHand < quantity) return false;
      p.stockOnHand -= quantity;
      return true;
    },
    async releaseStock(sku, quantity) {
      const p = find(sku);
      if (p && p.stockOnHand != null) p.stockOnHand += quantity;
    },
  };
}

function memoryCarts() {
  const rows = new Map();
  return {
    rows,
    async create(cart) {
      const row = { id: newId(), version: 0, status: 'OPEN', promoCode: null, serviceAddress: null, serviceability: null, reminderSentAt: null, updatedAt: new Date(), ...clone(cart) };
      rows.set(row.id, row);
      return clone(row);
    },
    async findById(id) {
      return clone(rows.get(id) || null);
    },
    async findOpenByUser(userId) {
      return clone([...rows.values()].find((c) => c.userId === userId && c.status === 'OPEN') || null);
    },
    async updateVersioned(id, expectedVersion, patch) {
      const row = rows.get(id);
      if (!row || row.version !== expectedVersion || row.status !== 'OPEN') return null;
      Object.assign(row, clone(patch), { version: row.version + 1, updatedAt: new Date() });
      return clone(row);
    },
    async markCheckedOut(id) {
      const row = rows.get(id);
      row.status = 'CHECKED_OUT';
    },
    async findAbandoned({ idleSince }) {
      return clone(
        [...rows.values()].filter(
          (c) => c.status === 'OPEN' && c.userId && c.items.length && c.updatedAt <= idleSince && !c.reminderSentAt,
        ),
      );
    },
    async markReminderSent(id, at) {
      rows.get(id).reminderSentAt = at;
    },
    async expireStale(now) {
      let count = 0;
      for (const c of rows.values()) {
        if (c.status === 'OPEN' && c.expiresAt <= now) {
          c.status = 'ABANDONED';
          count += 1;
        }
      }
      return count;
    },
  };
}

function memoryOrders() {
  const rows = new Map();
  return {
    rows,
    async create(order) {
      if (rows.has(order.orderNumber)) throw Object.assign(new Error('dup'), { code: 11000 });
      const row = { id: newId(), createdAt: new Date(), ...clone(order) };
      row.payment = { status: 'PENDING', capturedAmount: 0, refundedAmount: 0, ...(row.payment || {}) };
      rows.set(order.orderNumber, row);
      return clone(row);
    },
    async findByNumber(n) {
      return clone(rows.get(n) || null);
    },
    async list({ accountId, status }, { page, pageSize }) {
      const items = [...rows.values()].filter((o) => (!accountId || o.accountId === accountId) && (!status || o.status === status));
      return paginateArray(items, { page, pageSize });
    },
    async transition(n, expectedStatus, entry, patch = {}) {
      const row = rows.get(n);
      if (!row || row.status !== expectedStatus) return null;
      applySet(row, clone(patch));
      row.status = entry.to;
      row.statusHistory = [...(row.statusHistory || []), entry];
      return clone(row);
    },
    async updatePayment(n, paymentPatch) {
      const row = rows.get(n);
      row.payment = { ...row.payment, ...clone(paymentPatch) };
      return clone(row);
    },
    async findByStatus(status) {
      return clone([...rows.values()].filter((o) => o.status === status));
    },
    async countByAccount(accountId) {
      return [...rows.values()].filter((o) => o.accountId === accountId).length;
    },
  };
}

function memoryAccounts(seed = []) {
  const rows = new Map(seed.map((a) => [a.accountId, { addresses: [], creditTermsDays: 0, taxExempt: false, existingCustomer: false, status: 'ACTIVE', ...a }]));
  let seq = 0;
  return {
    rows,
    async nextSequence() {
      seq += 1;
      return seq;
    },
    async create(account) {
      rows.set(account.accountId, { addresses: [], creditTermsDays: 0, ...clone(account) });
      return clone(rows.get(account.accountId));
    },
    async findByAccountId(id) {
      return clone(rows.get(id) || null);
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, clone(patch));
      return clone(row);
    },
    async addAddress(id, entry) {
      const row = rows.get(id);
      if (entry.isDefault) row.addresses.forEach((a) => { a.isDefault = false; });
      row.addresses.push({ _id: newId(), ...clone(entry) });
      return clone(row);
    },
    async removeAddress(id, addressId) {
      const row = rows.get(id);
      row.addresses = row.addresses.filter((a) => a._id !== addressId);
      return clone(row);
    },
  };
}

function memoryUsers(seed = []) {
  const rows = new Map(seed.map((u) => [u.id, { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, ...u, _id: u.id }]));
  return {
    rows,
    async create(user) {
      const id = newId();
      const row = { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, ...clone(user), id, _id: id };
      rows.set(id, row);
      return clone(row);
    },
    async findByEmailWithSecret(email) {
      return clone([...rows.values()].find((u) => u.email === email.toLowerCase()) || null);
    },
    async findById(id) {
      const row = rows.get(String(id));
      if (!row) return null;
      const { passwordHash, ...rest } = clone(row);
      return rest;
    },
    async findByIdWithSecret(id) {
      return clone(rows.get(String(id)) || null);
    },
    async update(id, patch) {
      const row = rows.get(String(id));
      if (!row) return null;
      Object.assign(row, clone(patch));
      return this.findById(id);
    },
    async listByAccount(accountId) {
      return [...rows.values()].filter((u) => u.accountId === accountId).map(({ passwordHash, ...u }) => clone(u));
    },
    async recordLoginFailure(id, { lockThreshold, lockMinutes, now }) {
      const row = rows.get(String(id));
      row.failedLoginCount += 1;
      if (row.failedLoginCount >= lockThreshold) {
        row.lockedUntil = new Date(now.getTime() + lockMinutes * 60000);
        row.failedLoginCount = 0;
      }
    },
    async recordLoginSuccess(id, now) {
      Object.assign(rows.get(String(id)), { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now });
    },
  };
}

function memorySessions() {
  const rows = new Map();
  return {
    rows,
    async create(s) {
      rows.set(s.jti, { revokedAt: null, replacedBy: null, ...s });
    },
    async findByJti(jti) {
      return clone(rows.get(jti) || null);
    },
    async rotate(jti, replacedBy) {
      const s = rows.get(jti);
      if (!s || s.revokedAt) return false;
      Object.assign(s, { revokedAt: new Date(), replacedBy });
      return true;
    },
    async revokeFamily(familyId) {
      for (const s of rows.values()) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = new Date();
    },
    async revokeAllForUser(userId) {
      for (const s of rows.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = new Date();
    },
  };
}

function memoryPromos(seed = []) {
  const promos = new Map(seed.map((p) => [p.code, { active: true, redemptionCount: 0, segments: [], eligibleSkus: [], perAccountLimit: 1, ...p }]));
  const redemptions = [];
  return {
    promos,
    redemptions,
    async findByCode(code) {
      return clone(promos.get(code.toUpperCase()) || null);
    },
    async countAccountRedemptions(code, accountId) {
      return redemptions.filter((r) => r.code === code && r.accountId === accountId && !r.reversedAt).length;
    },
    async claimRedemption(code) {
      const p = promos.get(code);
      if (!p || !p.active) return false;
      if (p.maxRedemptions != null && p.redemptionCount >= p.maxRedemptions) return false;
      p.redemptionCount += 1;
      return true;
    },
    async recordRedemption(r) {
      redemptions.push({ ...r, reversedAt: null });
    },
    async reverseRedemption(orderNumber) {
      const r = redemptions.find((x) => x.orderNumber === orderNumber && !x.reversedAt);
      if (!r) return false;
      r.reversedAt = new Date();
      promos.get(r.code).redemptionCount -= 1;
      return true;
    },
    async list({ active }, opts) {
      return paginateArray([...promos.values()].filter((p) => active === undefined || p.active === active), opts);
    },
    async upsert(p) {
      promos.set(p.code, { redemptionCount: 0, ...(promos.get(p.code) || {}), ...clone(p) });
      return clone(promos.get(p.code));
    },
    async deactivate(code) {
      const p = promos.get(code);
      if (!p) return null;
      p.active = false;
      return clone(p);
    },
  };
}

function memoryQuotes() {
  const rows = new Map();
  return {
    rows,
    async create(q) {
      const row = { id: newId(), internalNotes: [], convertedOrderNumbers: [], ...clone(q) };
      rows.set(q.quoteNumber, row);
      return clone(row);
    },
    async findByNumber(n) {
      return clone(rows.get(n) || null);
    },
    async list({ accountId, status }, opts) {
      return paginateArray([...rows.values()].filter((q) => (!accountId || q.accountId === accountId) && (!status || q.status === status)), opts);
    },
    async transition(n, { expectedStatus, expectedRevision }, entry, patch = {}, push = {}) {
      const row = rows.get(n);
      if (!row || row.status !== expectedStatus) return null;
      if (expectedRevision !== undefined && row.revision !== expectedRevision) return null;
      Object.assign(row, clone(patch), { status: entry.to });
      row.statusHistory = [...(row.statusHistory || []), entry];
      for (const [key, value] of Object.entries(push)) row[key] = [...(row[key] || []), value];
      return clone(row);
    },
    async findExpirable(now) {
      return clone([...rows.values()].filter((q) => ['SENT', 'ACCEPTED'].includes(q.status) && q.validUntil && new Date(q.validUntil) <= now));
    },
  };
}

function memoryInvoices() {
  const rows = [];
  return {
    rows,
    async createIfAbsent(invoice) {
      const key = (i) => `${i.orderNumber}|${i.kind}|${i.periodStart ? new Date(i.periodStart).toISOString() : ''}`;
      const existing = rows.find((r) => key(r) === key(invoice));
      if (existing) return { invoice: clone(existing), created: false };
      const row = { id: newId(), ...clone(invoice) };
      rows.push(row);
      return { invoice: clone(row), created: true };
    },
    async findByNumber(n) {
      return clone(rows.find((r) => r.invoiceNumber === n) || null);
    },
    async list({ accountId, status, orderNumber }, opts) {
      return paginateArray(
        rows.filter((r) => (!accountId || r.accountId === accountId) && (!status || r.status === status) && (!orderNumber || r.orderNumber === orderNumber)),
        opts,
      );
    },
    async voidOpenForOrder(orderNumber) {
      let n = 0;
      rows.forEach((r) => {
        if (r.orderNumber === orderNumber && r.status === 'ISSUED') {
          r.status = 'VOID';
          n += 1;
        }
      });
      return n;
    },
  };
}

function memoryServiceabilityChecks() {
  const rows = [];
  return {
    rows,
    async findFresh(addressKey, now) {
      return clone(rows.filter((r) => r.addressKey === addressKey && r.expiresAt > now).pop() || null);
    },
    async findByCheckId(checkId) {
      return clone(rows.find((r) => r.checkId === checkId) || null);
    },
    async save(check) {
      const row = { ...clone(check), createdAt: new Date() };
      rows.push(row);
      return clone(row);
    },
  };
}

function fakeNotifier() {
  const sent = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { sent: true };
    },
  };
}

function fakePaymentGateway({ decline = null } = {}) {
  const calls = [];
  return {
    calls,
    decline,
    async authorize(args) {
      calls.push(['authorize', args]);
      if (this.decline) throw this.decline;
      if (args.amount === 0) return { reference: null, status: 'NOT_REQUIRED', last4: null, brand: null };
      return { reference: `auth_${args.orderNumber}`, status: 'AUTHORIZED', last4: '4242', brand: 'visa' };
    },
    async capture(args) {
      calls.push(['capture', args]);
      return { reference: args.reference, capturedAmount: args.amount };
    },
    async void(args) {
      calls.push(['void', args]);
      return { reference: args.reference, status: 'VOIDED' };
    },
    async refund(args) {
      calls.push(['refund', args]);
      return { refundId: 'rf_1', amount: args.amount };
    },
  };
}

/** Upstream qualification API returning a configurable result per ZIP code. */
function fakeServiceabilityApi(byZip = {}, fallback = { serviceable: true, maxDownloadMbps: 1000 }) {
  const calls = [];
  return {
    calls,
    async qualify(address) {
      calls.push(address);
      const r = byZip[address.postalCode] || fallback;
      return {
        serviceable: r.serviceable,
        technology: r.serviceable ? 'FTTP' : null,
        maxDownloadMbps: r.serviceable ? r.maxDownloadMbps : 0,
        maxUploadMbps: r.serviceable ? r.maxDownloadMbps : 0,
        estimatedInstallDays: r.estimatedInstallDays ?? 5,
        requiresSiteSurvey: Boolean(r.requiresSiteSurvey),
        reasonCode: r.serviceable ? null : 'NOT_QUALIFIED',
        upstreamReference: r.serviceable ? `q-${address.postalCode}` : null,
      };
    },
    async reserveInstallSlot({ orderNumber }) {
      return { appointmentId: `appt-${orderNumber}`, scheduledFor: new Date('2026-12-01T13:00:00Z') };
    },
  };
}

/** Standard test catalogue: consumer + business plans, an add-on, hardware. */
const CATALOGUE = [
  { sku: 'GK-FIBRE-500', name: 'Fibre 500', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 500, uploadMbps: 500, monthlyPrice: 6500, installationFee: 9900 },
  { sku: 'GK-FIBRE-1000', name: 'Fibre 1 Gig', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 1000, uploadMbps: 1000, monthlyPrice: 8000, installationFee: 9900 },
  { sku: 'GK-FIBRE-2000', name: 'Fibre 2 Gig', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 2000, uploadMbps: 2000, monthlyPrice: 11000, installationFee: 9900 },
  { sku: 'BGK-FIBRE-1000', name: 'Business Fibre 1 Gig', type: 'PLAN', segments: ['BUSINESS'], speedMbps: 1000, uploadMbps: 1000, monthlyPrice: 14900, installationFee: 19900, maxQuantity: 200 },
  { sku: 'ADD-STATIC-IP', name: 'Static IP', type: 'ADDON', segments: ['CONSUMER', 'BUSINESS'], monthlyPrice: 1000, requiresPlan: true, compatiblePlanSkus: ['GK-FIBRE-1000', 'GK-FIBRE-2000', 'BGK-FIBRE-1000'], maxQuantity: 8 },
  { sku: 'HW-MESH-EXTENDER', name: 'Mesh extender', type: 'HARDWARE', segments: ['CONSUMER', 'BUSINESS'], oneTimePrice: 12900, maxQuantity: 6, stockOnHand: 2 },
];

const ADDRESS = { line1: '12 Main Street', city: 'Austin', state: 'TX', postalCode: '78701' };

module.exports = {
  applySet,
  memoryProducts,
  memoryCarts,
  memoryOrders,
  memoryAccounts,
  memoryUsers,
  memorySessions,
  memoryPromos,
  memoryQuotes,
  memoryInvoices,
  memoryServiceabilityChecks,
  fakeNotifier,
  fakePaymentGateway,
  fakeServiceabilityApi,
  CATALOGUE,
  ADDRESS,
};

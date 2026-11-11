'use strict';

const v = require('./validator');
const {
  SEGMENTS,
  PRODUCT_TYPES,
  ORDER_STATUS,
  QUOTE_STATUS,
  PROMO_KINDS,
  PROMO_SCOPES,
  CONTRACT_TERMS,
} = require('../domain/constants');
const { US_STATES } = require('../domain/address');

/** Request schemas, grouped by resource. Used by the `validate` middleware. */

const contractTerms = Object.keys(CONTRACT_TERMS).map(Number);
const objectId = () => v.string({ pattern: /^[a-f0-9]{24}$/i });
const sku = () => v.string({ min: 3, max: 40, uppercase: true, pattern: /^[A-Z0-9-]+$/ });
const promoCode = () => v.string({ min: 4, max: 24, uppercase: true, pattern: /^[A-Z0-9-]+$/ });

const address = () =>
  v.object({
    line1: v.string({ min: 3, max: 120 }),
    line2: v.string({ max: 60 }).optional(),
    city: v.string({ min: 2, max: 60 }),
    state: v.string({ uppercase: true }).refine((s) => US_STATES.has(s), 'Must be a valid US state code.'),
    postalCode: v.string({ pattern: /^\d{5}(-\d{4})?$/ }),
  });

const password = () =>
  v
    .string({ min: 10, max: 128, trim: false })
    .refine(
      (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p),
      'Must contain upper and lower case letters and a digit.',
    );

const pagination = {
  page: v.integer({ min: 1, coerce: true }).default(1),
  pageSize: v.integer({ min: 1, max: 100, coerce: true }).default(20),
};

const auth = {
  register: v.object({
    email: v.email(),
    password: password(),
    firstName: v.string({ min: 1, max: 60 }),
    lastName: v.string({ min: 1, max: 60 }),
    phone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER),
    businessName: v.string({ min: 2, max: 120 }).optional(),
    marketingOptIn: v.boolean().default(false),
  }),
  login: v.object({
    email: v.email(),
    password: v.string({ min: 1, max: 128, trim: false }),
  }),
  refresh: v.object({ refreshToken: v.string({ min: 20 }) }),
  changePassword: v.object({
    currentPassword: v.string({ min: 1, trim: false }),
    newPassword: password(),
  }),
};

const catalog = {
  list: v.object(
    {
      ...pagination,
      segment: v.oneOf(Object.values(SEGMENTS)).optional(),
      type: v.oneOf(Object.values(PRODUCT_TYPES)).optional(),
      minSpeedMbps: v.integer({ min: 0, coerce: true }).optional(),
      maxMonthlyPrice: v.integer({ min: 0, coerce: true }).optional(),
      search: v.string({ max: 80 }).optional(),
      sort: v.oneOf(['price', '-price', 'speed', '-speed', 'name']).default('price'),
      serviceabilityCheckId: v.string({ pattern: /^[0-9a-f-]{36}$/i }).optional(),
    },
    { allowUnknown: false },
  ),
  compare: v.object({
    skus: v
      .string({ min: 3, max: 200, uppercase: true })
      .refine((s) => s.split(',').every((part) => /^[A-Z0-9-]{3,40}$/.test(part.trim())), 'Must be a comma-separated SKU list.'),
  }),
  detail: v.object({ segment: v.oneOf(Object.values(SEGMENTS)).optional() }),
  skuParam: v.object({ sku: sku() }),
  upsert: v.object({
    sku: sku(),
    name: v.string({ min: 3, max: 120 }),
    description: v.string({ max: 2000 }).default(''),
    type: v.oneOf(Object.values(PRODUCT_TYPES)),
    segments: v.array(v.oneOf(Object.values(SEGMENTS)), { min: 1 }),
    speedMbps: v.integer({ min: 1, max: 10000 }).optional(),
    uploadMbps: v.integer({ min: 1, max: 10000 }).optional(),
    monthlyPrice: v.integer({ min: 0 }).default(0),
    oneTimePrice: v.integer({ min: 0 }).default(0),
    installationFee: v.integer({ min: 0 }).default(0),
    requiresPlan: v.boolean().default(false),
    compatiblePlanSkus: v.array(sku()).default([]),
    maxQuantity: v.integer({ min: 1, max: 500 }).default(1),
    stockOnHand: v.integer({ min: 0 }).optional(),
    features: v.array(v.string({ min: 1, max: 120 }), { max: 20 }).default([]),
    active: v.boolean().default(true),
  }),
};

const serviceability = {
  check: v.object({ address: address(), segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER) }),
  checkIdParam: v.object({ checkId: v.string({ pattern: /^[0-9a-f-]{36}$/i }) }),
  slots: v.object({ days: v.integer({ min: 1, max: 30, coerce: true }).default(14) }),
};

const cart = {
  create: v.object({ segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER) }),
  addItem: v.object({
    sku: sku(),
    quantity: v.integer({ min: 1, max: 500 }).default(1),
  }),
  updateItem: v.object({ quantity: v.integer({ min: 0, max: 500 }) }),
  setTerm: v.object({ contractTermMonths: v.oneOf(contractTerms) }),
  setAddress: v.object({ address: address() }),
  applyPromo: v.object({ code: promoCode() }),
  cartIdParam: v.object({ cartId: objectId() }),
  itemParam: v.object({ cartId: objectId(), sku: sku() }),
};

const checkout = {
  placeOrder: v.object({
    cartId: objectId(),
    paymentToken: v.string({ min: 8, max: 200 }),
    billingAddress: address().optional(),
    contact: v.object({
      email: v.email(),
      phone: v.string({ pattern: /^\+?1?\d{10}$/ }),
      firstName: v.string({ min: 1, max: 60 }),
      lastName: v.string({ min: 1, max: 60 }),
    }),
    preferredInstallDate: v.isoDate().optional(),
    acceptTerms: v.boolean().refine((b) => b === true, 'Terms and conditions must be accepted.'),
  }),
};

const orders = {
  list: v.object({
    ...pagination,
    status: v.oneOf(Object.values(ORDER_STATUS)).optional(),
    accountId: v.string({ pattern: /^ACC-\d{8}$/ }).optional(),
  }),
  orderNumberParam: v.object({ orderNumber: v.string({ pattern: /^GK-\d{8}-[A-Z0-9]{6}$/ }) }),
  cancel: v.object({ reason: v.string({ min: 3, max: 500 }) }),
  advance: v.object({
    status: v.oneOf(Object.values(ORDER_STATUS)),
    reason: v.string({ max: 500 }).optional(),
  }),
};

const quoteItem = () =>
  v.object({
    sku: sku(),
    quantity: v.integer({ min: 1, max: 500 }),
  });

const quotes = {
  request: v.object({
    companyName: v.string({ min: 2, max: 120 }),
    contactEmail: v.email(),
    contactPhone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    items: v.array(quoteItem(), { min: 1, max: 50 }),
    sites: v.array(address(), { min: 1, max: 200 }),
    contractTermMonths: v.oneOf(contractTerms).default(36),
    notes: v.string({ max: 2000 }).optional(),
  }),
  list: v.object({
    ...pagination,
    status: v.oneOf(Object.values(QUOTE_STATUS)).optional(),
    accountId: v.string({ pattern: /^ACC-\d{8}$/ }).optional(),
  }),
  quoteNumberParam: v.object({ quoteNumber: v.string({ pattern: /^QTE-\d{8}-[A-Z0-9]{4}$/ }) }),
  price: v.object({
    negotiatedDiscountBps: v.integer({ min: 0, max: 5000 }).default(0),
    contractTermMonths: v.oneOf(contractTerms).optional(),
    items: v.array(quoteItem(), { min: 1, max: 50 }).optional(),
    internalNote: v.string({ max: 1000 }).optional(),
  }),
  decision: v.object({ reason: v.string({ max: 500 }).optional() }),
  accept: v.object({ paymentToken: v.string({ min: 8, max: 200 }).optional(), poNumber: v.string({ max: 40 }).optional() }),
};

const promos = {
  upsert: v.object({
    code: promoCode(),
    description: v.string({ max: 300 }).default(''),
    kind: v.oneOf(Object.values(PROMO_KINDS)),
    scope: v.oneOf(Object.values(PROMO_SCOPES)).default(PROMO_SCOPES.ALL),
    valueBps: v.integer({ min: 1, max: 10000 }).optional(),
    valueAmount: v.integer({ min: 1 }).optional(),
    freeMonths: v.integer({ min: 1, max: 12 }).optional(),
    maxDiscountAmount: v.integer({ min: 1 }).optional(),
    durationMonths: v.integer({ min: 1, max: 36 }).optional(),
    segments: v.array(v.oneOf(Object.values(SEGMENTS))).default([]),
    eligibleSkus: v.array(sku()).default([]),
    minMonthlySpend: v.integer({ min: 0 }).optional(),
    minContractTermMonths: v.oneOf(contractTerms).optional(),
    maxRedemptions: v.integer({ min: 1 }).optional(),
    perAccountLimit: v.integer({ min: 1 }).default(1),
    newCustomersOnly: v.boolean().default(false),
    startsAt: v.isoDate().optional(),
    endsAt: v.isoDate().optional(),
    active: v.boolean().default(true),
  }),
  codeParam: v.object({ code: promoCode() }),
  list: v.object({ ...pagination, active: v.boolean({ coerce: true }).optional() }),
};

const account = {
  updateProfile: v.object({
    firstName: v.string({ min: 1, max: 60 }).optional(),
    lastName: v.string({ min: 1, max: 60 }).optional(),
    phone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    marketingOptIn: v.boolean().optional(),
  }),
  addAddress: v.object({
    label: v.string({ min: 1, max: 40 }),
    address: address(),
    isDefault: v.boolean().default(false),
  }),
  addressIdParam: v.object({ addressId: objectId() }),
  userIdParam: v.object({ userId: objectId() }),
  inviteUser: v.object({
    email: v.email(),
    firstName: v.string({ min: 1, max: 60 }),
    lastName: v.string({ min: 1, max: 60 }),
    role: v.oneOf(['BUSINESS_ADMIN', 'BUSINESS_USER']),
  }),
  activateInvite: v.object({
    token: v.string({ min: 20, max: 2000 }),
    password: password(),
  }),
};

const invoices = {
  list: v.object({
    ...pagination,
    status: v.oneOf(['ISSUED', 'PAID', 'VOID']).optional(),
    orderNumber: v.string({ pattern: /^GK-\d{8}-[A-Z0-9]{6}$/ }).optional(),
  }),
  invoiceNumberParam: v.object({ invoiceNumber: v.string({ pattern: /^INV-\d{6}-[A-Z0-9]{6}$/ }) }),
};

module.exports = { auth, catalog, serviceability, cart, checkout, orders, quotes, promos, account, invoices, address };

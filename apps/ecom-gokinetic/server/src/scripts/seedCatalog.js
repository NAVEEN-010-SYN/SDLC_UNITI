'use strict';

/**
 * Seeds the starter catalogue and launch promos for local development and
 * fresh environments. Idempotent: products and promos are upserted by key
 * through the same services the admin API uses, so business rules apply.
 *
 * Usage: npm run seed
 */

const config = require('../config');
const { logger } = require('../config/logger');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { createContainer } = require('../container');

const BOTH = ['CONSUMER', 'BUSINESS'];
const ALL_PLANS = ['GK-FIBRE-100', 'GK-FIBRE-500', 'GK-FIBRE-1000', 'GK-FIBRE-2000', 'BGK-FIBRE-500', 'BGK-FIBRE-1000', 'BGK-FIBRE-2000'];

const plan = (sku, name, segment, speedMbps, uploadMbps, monthlyPrice, installationFee, sortOrder, features) => ({
  sku,
  name,
  type: 'PLAN',
  segments: [segment],
  speedMbps,
  uploadMbps,
  monthlyPrice,
  oneTimePrice: 0,
  installationFee,
  maxQuantity: segment === 'BUSINESS' ? 200 : 1,
  features,
  sortOrder,
});

const PRODUCTS = [
  plan('GK-FIBRE-100', 'Fibre 100', 'CONSUMER', 100, 100, 4500, 9900, 10, ['Unlimited data', 'Symmetrical speeds']),
  plan('GK-FIBRE-500', 'Fibre 500', 'CONSUMER', 500, 500, 6500, 9900, 20, ['Unlimited data', 'Wi-Fi 6 router included']),
  plan('GK-FIBRE-1000', 'Fibre 1 Gig', 'CONSUMER', 1000, 1000, 8000, 9900, 30, ['Unlimited data', 'Wi-Fi 6E router included']),
  plan('GK-FIBRE-2000', 'Fibre 2 Gig', 'CONSUMER', 2000, 2000, 11000, 9900, 40, ['Unlimited data', 'Wi-Fi 7 router included', 'Priority support']),
  plan('BGK-FIBRE-500', 'Business Fibre 500', 'BUSINESS', 500, 500, 9900, 19900, 20, ['99.9% SLA', 'Next-business-day fix']),
  plan('BGK-FIBRE-1000', 'Business Fibre 1 Gig', 'BUSINESS', 1000, 1000, 14900, 19900, 30, ['99.95% SLA', '8-hour fix']),
  plan('BGK-FIBRE-2000', 'Business Fibre 2 Gig', 'BUSINESS', 2000, 2000, 22900, 19900, 40, ['99.95% SLA', '4-hour fix', 'Dedicated account manager']),
  {
    sku: 'ADD-STATIC-IP',
    name: 'Static IP address',
    type: 'ADDON',
    segments: BOTH,
    monthlyPrice: 1000,
    requiresPlan: true,
    compatiblePlanSkus: ALL_PLANS,
    maxQuantity: 8,
    features: ['Single IPv4 address', '/56 IPv6 prefix'],
    sortOrder: 10,
  },
  {
    sku: 'ADD-VOICE-LINE',
    name: 'Home & Office Voice',
    type: 'ADDON',
    segments: BOTH,
    monthlyPrice: 1500,
    installationFee: 0,
    requiresPlan: true,
    compatiblePlanSkus: ALL_PLANS,
    maxQuantity: 4,
    features: ['Unlimited US calling', 'Keep your number'],
    sortOrder: 20,
  },
  {
    sku: 'ADD-WHOLE-HOME-WIFI',
    name: 'Whole-Home Wi-Fi',
    type: 'ADDON',
    segments: ['CONSUMER'],
    monthlyPrice: 1000,
    requiresPlan: true,
    compatiblePlanSkus: ['GK-FIBRE-500', 'GK-FIBRE-1000', 'GK-FIBRE-2000'],
    features: ['Two mesh extenders', 'Coverage guarantee'],
    sortOrder: 30,
  },
  {
    sku: 'HW-MESH-EXTENDER',
    name: 'Mesh extender',
    type: 'HARDWARE',
    segments: BOTH,
    oneTimePrice: 12900,
    maxQuantity: 6,
    stockOnHand: 500,
    features: ['Wi-Fi 6E', 'Wired backhaul port'],
    sortOrder: 40,
  },
  {
    sku: 'HW-LTE-BACKUP',
    name: '4G/LTE failover router',
    type: 'HARDWARE',
    segments: ['BUSINESS'],
    oneTimePrice: 24900,
    maxQuantity: 200,
    stockOnHand: 250,
    features: ['Automatic failover', 'Data plan sold separately'],
    sortOrder: 50,
  },
];

const PROMOS = [
  {
    code: 'WELCOME-3FREE',
    description: 'First three months free on any home fibre plan with a 24-month term.',
    kind: 'FREE_MONTHS',
    freeMonths: 3,
    segments: ['CONSUMER'],
    minContractTermMonths: 24,
    newCustomersOnly: true,
  },
  {
    code: 'FREEINSTALL',
    description: 'Free installation on monthly (no-contract) plans.',
    kind: 'FREE_INSTALLATION',
    segments: ['CONSUMER'],
  },
  {
    code: 'BIZ-10OFF',
    description: '10% off recurring charges for 12 months.',
    kind: 'PERCENT_OFF',
    scope: 'RECURRING',
    valueBps: 1000,
    durationMonths: 12,
    segments: ['BUSINESS'],
    maxRedemptions: 500,
  },
];

async function seed() {
  await connectDatabase(config.mongo.uri);
  const { services } = createContainer(config);
  const defaults = { description: '', oneTimePrice: 0, installationFee: 0, monthlyPrice: 0, requiresPlan: false, compatiblePlanSkus: [], maxQuantity: 1, active: true };
  for (const product of PRODUCTS) {
    await services.catalogService.upsert({ ...defaults, ...product });
  }
  for (const promo of PROMOS) {
    await services.promoService.upsert({ scope: 'ALL', eligibleSkus: [], perAccountLimit: 1, active: true, ...promo });
  }
  logger.info('seed.completed', { products: PRODUCTS.length, promos: PROMOS.length });
}

seed()
  .catch((err) => {
    logger.error('seed.failed', { error: err });
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());

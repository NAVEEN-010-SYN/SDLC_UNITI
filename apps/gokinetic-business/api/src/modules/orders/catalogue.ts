import { ServiceCategory } from '../inventory/inventory.types';

export interface CatalogueProduct {
  code: string;
  name: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  monthlyPriceMinor: number;
  installChargeMinor: number;
  /** Products that can only be added to a site already carrying an active connectivity service. */
  requiresConnectivity: boolean;
}

/**
 * Business price book (ex-VAT, pence). Tiers mirror the fibre portfolio:
 * 100 Mbps, 500 Mbps, 1 Gbps, 2 Gbps symmetrical, plus add-on voice, SD-WAN and hosted.
 */
const PRODUCTS: readonly CatalogueProduct[] = [
  { code: 'FTTP-100', name: 'Business Fibre 100 Mbps', category: 'BROADBAND', bandwidthMbps: 100, monthlyPriceMinor: 3500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500, monthlyPriceMinor: 5500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-1000', name: 'Business Fibre 1 Gbps', category: 'BROADBAND', bandwidthMbps: 1000, monthlyPriceMinor: 7500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-2000', name: 'Business Fibre 2 Gbps', category: 'BROADBAND', bandwidthMbps: 2000, monthlyPriceMinor: 11000, installChargeMinor: 14900, requiresConnectivity: false },
  { code: 'VOICE-SIP-4', name: 'SIP Voice (4 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 2400, installChargeMinor: 0, requiresConnectivity: true },
  { code: 'VOICE-SIP-10', name: 'SIP Voice (10 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 5200, installChargeMinor: 0, requiresConnectivity: true },
  { code: 'SDWAN-STD', name: 'Managed SD-WAN Standard', category: 'SDWAN', bandwidthMbps: null, monthlyPriceMinor: 8900, installChargeMinor: 25000, requiresConnectivity: true },
  { code: 'HOSTED-EMAIL-25', name: 'Hosted Email (25 mailboxes)', category: 'HOSTED', bandwidthMbps: null, monthlyPriceMinor: 3750, installChargeMinor: 0, requiresConnectivity: false }
];

const BY_CODE = new Map(PRODUCTS.map((p) => [p.code, p]));

/** Charge for relocating an existing service to another site on the account. */
export const MOVE_CHARGE_MINOR = 12500;
/** Charge for downgrading a service mid-term (upgrades are free). */
export const DOWNGRADE_CHARGE_MINOR = 5000;

export function findProduct(code: string | null | undefined): CatalogueProduct | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

export function listProducts(): readonly CatalogueProduct[] {
  return PRODUCTS;
}

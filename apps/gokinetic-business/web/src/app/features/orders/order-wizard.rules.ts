import { CatalogueProduct, OrderType, Service } from '../../core/models/api.models';

export const ORDER_TYPES: Array<{ value: OrderType; label: string; hint: string }> = [
  { value: 'PROVIDE', label: 'New connection', hint: 'Install fibre connectivity at a site' },
  { value: 'ADD', label: 'Add a service', hint: 'Voice, SD-WAN or hosted services on an existing site' },
  { value: 'CHANGE', label: 'Change speed', hint: 'Upgrade or downgrade an existing service' },
  { value: 'MOVE', label: 'Move a service', hint: 'Relocate a service to another of your sites' },
  { value: 'CEASE', label: 'Cease a service', hint: 'Stop a service at the end of its notice period' }
];

export interface OrderFields {
  service: boolean;
  product: boolean;
  targetSite: boolean;
  minLeadDays: number;
}

/** Which inputs each order type needs, mirroring the API's order-planner rules. */
export function fieldsFor(type: OrderType): OrderFields {
  switch (type) {
    case 'PROVIDE':
      return { service: false, product: true, targetSite: false, minLeadDays: 10 };
    case 'ADD':
      return { service: false, product: true, targetSite: false, minLeadDays: 1 };
    case 'CHANGE':
      return { service: true, product: true, targetSite: false, minLeadDays: 1 };
    case 'MOVE':
      return { service: true, product: false, targetSite: true, minLeadDays: 10 };
    case 'CEASE':
      return { service: true, product: false, targetSite: false, minLeadDays: 30 };
  }
}

/** Products offered for an order type: PROVIDE/CHANGE are connectivity, ADD is add-ons. */
export function productsFor(type: OrderType, products: CatalogueProduct[], current?: Service): CatalogueProduct[] {
  if (type === 'PROVIDE') return products.filter((p) => p.category === 'BROADBAND');
  if (type === 'ADD') return products.filter((p) => p.category !== 'BROADBAND');
  if (type === 'CHANGE' && current) {
    return products.filter((p) => p.category === current.category && p.code !== current.productCode);
  }
  return [];
}

/** Wizard step that owns each form field. */
const FIELD_STEP: Record<string, number> = {
  orderType: 0,
  siteId: 0,
  serviceId: 1,
  productCode: 1,
  targetSiteId: 1,
  requestedDate: 2,
  notes: 2
};

/** Earliest step owning one of the given API field names (e.g. "body.siteId"), or null. */
export function firstStepForFields(fields: string[]): number | null {
  let earliest: number | null = null;
  for (const field of fields) {
    const name = field.startsWith('body.') ? field.slice('body.'.length) : field;
    const step = FIELD_STEP[name];
    if (step === undefined) continue;
    if (earliest === null || step < earliest) earliest = step;
  }
  return earliest;
}

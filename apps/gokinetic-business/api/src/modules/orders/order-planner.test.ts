import { SITE_A, SITE_B, makeService, makeSite } from '../../test/fixtures';
import { DOWNGRADE_CHARGE_MINOR, MOVE_CHARGE_MINOR } from './catalogue';
import { PlanningContext, annualisedImpactMinor, planOrder } from './order-planner';

const TODAY = new Date('2024-06-03T09:00:00Z'); // Monday
const SVC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function ctx(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    site: makeSite(),
    servicesAtSite: [],
    servicesWithOpenOrders: new Set(),
    today: TODAY,
    ...overrides
  };
}

function issuesOf(result: ReturnType<typeof planOrder>) {
  return result.ok ? [] : result.issues;
}

describe('planOrder PROVIDE', () => {
  it('prices a new fibre connection', () => {
    const result = planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-1000' }, ctx());
    expect(result).toEqual({
      ok: true,
      plan: { productCode: 'FTTP-1000', bandwidthMbps: 1000, monthlyDeltaMinor: 7500, oneOffChargeMinor: 9900 }
    });
  });

  it('rejects a provide at a site that already has connectivity', () => {
    const result = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-500' },
      ctx({ servicesAtSite: [makeService()] })
    );
    expect(issuesOf(result)).toContainEqual(expect.objectContaining({ field: 'siteId' }));
  });

  it('rejects non-connectivity products on PROVIDE', () => {
    const result = planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'HOSTED-EMAIL-25' }, ctx());
    expect(issuesOf(result)[0].field).toBe('productCode');
  });

  it('enforces the 10-day lead time and weekday appointments', () => {
    const tooSoon = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100', requestedDate: '2024-06-05' },
      ctx()
    );
    expect(issuesOf(tooSoon).map((i) => i.message)).toEqual([expect.stringContaining('lead time')]);

    const saturday = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100', requestedDate: '2024-06-22' },
      ctx()
    );
    expect(issuesOf(saturday).map((i) => i.message)).toEqual([expect.stringContaining('weekdays')]);
  });

  it('rejects decommissioned sites and unknown sites', () => {
    expect(issuesOf(planOrder({ orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' }, ctx({ site: undefined })))[0].field).toBe('siteId');
    const decom = planOrder(
      { orderType: 'PROVIDE', siteId: SITE_A, productCode: 'FTTP-100' },
      ctx({ site: makeSite({ status: 'DECOMMISSIONED' }) })
    );
    expect(issuesOf(decom)[0].message).toMatch(/decommissioned/);
  });
});

describe('planOrder ADD', () => {
  it('requires connectivity for voice', () => {
    const result = planOrder({ orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' }, ctx());
    expect(issuesOf(result)[0].message).toMatch(/requires an active fibre service/);
  });

  it('allows voice at a connected site', () => {
    const result = planOrder(
      { orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' },
      ctx({ servicesAtSite: [makeService()] })
    );
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate add-ons', () => {
    const result = planOrder(
      { orderType: 'ADD', siteId: SITE_A, productCode: 'VOICE-SIP-4' },
      ctx({ servicesAtSite: [makeService(), makeService({ id: 'v1', category: 'VOICE', productCode: 'VOICE-SIP-4' })] })
    );
    expect(issuesOf(result)[0].message).toMatch(/already present/);
  });
});

describe('planOrder CHANGE', () => {
  it('prices an upgrade with no one-off charge', () => {
    const service = makeService({ productCode: 'FTTP-500', bandwidthMbps: 500, monthlyChargeMinor: 5500 });
    const result = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' },
      ctx({ service, servicesAtSite: [service] })
    );
    expect(result).toEqual({
      ok: true,
      plan: { productCode: 'FTTP-2000', bandwidthMbps: 2000, monthlyDeltaMinor: 5500, oneOffChargeMinor: 0 }
    });
  });

  it('charges for a downgrade', () => {
    const service = makeService({ productCode: 'FTTP-1000', monthlyChargeMinor: 7500 });
    const result = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-100' },
      ctx({ service })
    );
    expect(result.ok && result.plan).toMatchObject({ monthlyDeltaMinor: -4000, oneOffChargeMinor: DOWNGRADE_CHARGE_MINOR });
  });

  it('rejects category changes, same product and services with open orders', () => {
    const service = makeService();
    const crossCategory = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'VOICE-SIP-4' },
      ctx({ service })
    );
    expect(issuesOf(crossCategory)[0].message).toMatch(/Cannot change a BROADBAND/);

    const same = planOrder({ orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-1000' }, ctx({ service }));
    expect(issuesOf(same)[0].message).toMatch(/already on this product/);

    const busy = planOrder(
      { orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' },
      ctx({ service, servicesWithOpenOrders: new Set([SVC]) })
    );
    expect(issuesOf(busy)[0].message).toMatch(/open order/);
  });

  it('rejects ceased services', () => {
    const service = makeService({ status: 'CEASED' });
    const result = planOrder({ orderType: 'CHANGE', siteId: SITE_A, serviceId: SVC, productCode: 'FTTP-2000' }, ctx({ service }));
    expect(issuesOf(result)[0].message).toMatch(/CEASED/);
  });
});

describe('planOrder MOVE', () => {
  it('charges the move fee and requires a different live target site', () => {
    const service = makeService();
    const ok = planOrder(
      { orderType: 'MOVE', siteId: SITE_A, serviceId: SVC, targetSiteId: SITE_B, requestedDate: '2024-06-24' },
      ctx({ service, targetSite: makeSite({ id: SITE_B }) })
    );
    expect(ok.ok && ok.plan.oneOffChargeMinor).toBe(MOVE_CHARGE_MINOR);

    const same = planOrder({ orderType: 'MOVE', siteId: SITE_A, serviceId: SVC, targetSiteId: SITE_A }, ctx({ service }));
    expect(issuesOf(same)[0].field).toBe('targetSiteId');
  });
});

describe('planOrder CEASE', () => {
  it('blocks ceasing connectivity while dependent services remain', () => {
    const fibre = makeService();
    const voice = makeService({ id: 'v1', category: 'VOICE', productCode: 'VOICE-SIP-4', productName: 'SIP Voice (4 channels)' });
    const result = planOrder({ orderType: 'CEASE', siteId: SITE_A, serviceId: SVC }, ctx({ service: fibre, servicesAtSite: [fibre, voice] }));
    expect(issuesOf(result)[0].message).toMatch(/SIP Voice/);
  });

  it('returns a negative monthly delta', () => {
    const fibre = makeService({ monthlyChargeMinor: 7500 });
    const result = planOrder({ orderType: 'CEASE', siteId: SITE_A, serviceId: SVC }, ctx({ service: fibre, servicesAtSite: [fibre] }));
    expect(result.ok && result.plan.monthlyDeltaMinor).toBe(-7500);
  });
});

describe('annualisedImpactMinor', () => {
  it('counts twelve months of increases plus one-off charges', () => {
    expect(annualisedImpactMinor({ monthlyDeltaMinor: 1000, oneOffChargeMinor: 500 })).toBe(12500);
  });
  it('ignores recurring reductions', () => {
    expect(annualisedImpactMinor({ monthlyDeltaMinor: -1000, oneOffChargeMinor: 500 })).toBe(500);
  });
});

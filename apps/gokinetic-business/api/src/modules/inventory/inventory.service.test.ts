import { BusinessRuleError, ForbiddenError, NotFoundError } from '../../lib/errors';
import {
  ACCOUNT_ID,
  SITE_A,
  SITE_B,
  adminCtx,
  makeService,
  makeSite,
  passthroughDb,
  recordingAudit,
  userCtx
} from '../../test/fixtures';
import { InventoryRepository } from './inventory.repository';
import { InventoryService, normalisePostcode, summariseServices } from './inventory.service';

function repoMock(): jest.Mocked<InventoryRepository> {
  return {
    listSites: jest.fn(),
    findSite: jest.fn(),
    findSitesByIds: jest.fn(),
    createSite: jest.fn(),
    updateSite: jest.fn(),
    listServices: jest.fn(),
    findService: jest.fn(),
    servicesForSite: jest.fn(),
    allServices: jest.fn(),
    countSites: jest.fn(),
    updateServiceStatus: jest.fn()
  };
}

function setup() {
  const repo = repoMock();
  const costCentres = { isActiveCostCentre: jest.fn(async () => true) };
  const openOrders = { countOpenOrdersForSite: jest.fn(async () => 0) };
  const audit = recordingAudit();
  const service = new InventoryService(passthroughDb(), repo, costCentres, openOrders, audit);
  return { repo, costCentres, openOrders, audit, service };
}

describe('normalisePostcode', () => {
  it.each([
    ['ec1a1bb', 'EC1A 1BB'],
    ['  M1 1AE ', 'M1 1AE'],
    ['b338th', 'B33 8TH'],
    ['CR2 6XH', 'CR2 6XH']
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePostcode(input, 'GB')).toBe(expected);
  });

  it('rejects malformed UK postcodes', () => {
    expect(() => normalisePostcode('12345', 'GB')).toThrow(BusinessRuleError);
  });

  it('leaves non-UK postcodes upper-cased but otherwise untouched', () => {
    expect(normalisePostcode('d02 x285', 'IE')).toBe('D02 X285');
  });
});

describe('summariseServices', () => {
  it('aggregates recurring charges and bandwidth excluding ceased services', () => {
    const summary = summariseServices(
      [
        makeService({ monthlyChargeMinor: 10000, bandwidthMbps: 1000 }),
        makeService({ category: 'VOICE', bandwidthMbps: null, monthlyChargeMinor: 2500 }),
        makeService({ status: 'SUSPENDED', monthlyChargeMinor: 5000, bandwidthMbps: 500 }),
        makeService({ status: 'CEASED', monthlyChargeMinor: 9999, bandwidthMbps: 2000 }),
        makeService({ status: 'PENDING', monthlyChargeMinor: 7000, bandwidthMbps: 100 })
      ],
      'GBP'
    );
    expect(summary.monthlyRecurringMinor).toBe(17500);
    expect(summary.totalBandwidthMbps).toBe(1000);
    expect(summary.serviceCount).toBe(4);
    expect(summary.byCategory.BROADBAND).toEqual({ count: 3, monthlyRecurringMinor: 15000 });
    expect(summary.byCategory.VOICE).toEqual({ count: 1, monthlyRecurringMinor: 2500 });
    expect(summary.byStatus).toEqual({ PENDING: 1, ACTIVE: 2, SUSPENDED: 1, CEASED: 1 });
  });
});

describe('InventoryService', () => {
  it('restricts site listings to a business user site scope', async () => {
    const { repo, service } = setup();
    repo.listSites.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await service.listSites(userCtx(), {}, { page: 1, pageSize: 20 });
    expect(repo.listSites).toHaveBeenCalledWith(ACCOUNT_ID, { siteIds: [SITE_A] }, { page: 1, pageSize: 20 });
  });

  it('does not restrict admins', async () => {
    const { repo, service } = setup();
    repo.listSites.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await service.listSites(adminCtx(), { status: 'ACTIVE' }, { page: 1, pageSize: 20 });
    expect(repo.listSites).toHaveBeenCalledWith(ACCOUNT_ID, { status: 'ACTIVE', siteIds: null }, expect.anything());
  });

  it('hides out-of-scope sites as not found', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite({ id: SITE_B }));
    await expect(service.getSite(userCtx(), SITE_B)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('computes monthly recurring charge on site detail', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([
      makeService({ monthlyChargeMinor: 1000 }),
      makeService({ status: 'CEASED', monthlyChargeMinor: 5000 })
    ]);
    const detail = await service.getSite(adminCtx(), SITE_A);
    expect(detail.monthlyRecurringMinor).toBe(1000);
    expect(detail.services).toHaveLength(2);
  });

  it('creates a site with a normalised postcode and records an audit entry', async () => {
    const { repo, service, audit } = setup();
    repo.createSite.mockImplementation(async (s) => makeSite({ code: s.code, postcode: s.postcode }));
    const site = await service.createSite(adminCtx(), {
      code: 'man-02',
      name: 'Manchester',
      addressLine1: '2 Light St',
      city: 'Manchester',
      postcode: 'm11ae',
      country: 'GB'
    });
    expect(site.postcode).toBe('M1 1AE');
    expect(site.code).toBe('MAN-02');
    expect(audit.entries[0]).toMatchObject({ action: 'site.created', entity: 'site' });
  });

  it('rejects an inactive cost centre', async () => {
    const { service, costCentres } = setup();
    costCentres.isActiveCostCentre.mockResolvedValue(false);
    await expect(
      service.createSite(adminCtx(), {
        code: 'X1',
        name: 'Site',
        addressLine1: '1 Road',
        city: 'Leeds',
        postcode: 'LS1 1UR',
        country: 'GB',
        costCentreId: '99999999-9999-4999-8999-999999999999'
      })
    ).rejects.toMatchObject({ code: 'business-rule/unknown-cost-centre' });
  });

  it('refuses to decommission a site with live services', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([makeService()]);
    await expect(service.decommissionSite(adminCtx(), SITE_A)).rejects.toMatchObject({
      code: 'business-rule/site-has-live-services'
    });
  });

  it('refuses to decommission a site with open orders', async () => {
    const { repo, service, openOrders } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([makeService({ status: 'CEASED' })]);
    openOrders.countOpenOrdersForSite.mockResolvedValue(2);
    await expect(service.decommissionSite(adminCtx(), SITE_A)).rejects.toMatchObject({
      code: 'business-rule/site-has-open-orders'
    });
  });

  it('decommissions an empty site', async () => {
    const { repo, service, audit } = setup();
    repo.findSite.mockResolvedValue(makeSite());
    repo.servicesForSite.mockResolvedValue([]);
    repo.updateSite.mockResolvedValue(makeSite({ status: 'DECOMMISSIONED' }));
    const result = await service.decommissionSite(adminCtx(), SITE_A);
    expect(result.status).toBe('DECOMMISSIONED');
    expect(audit.entries.map((e) => e.action)).toEqual(['site.decommissioned']);
  });

  it('blocks a business user filtering services by a site outside scope', () => {
    const { service } = setup();
    expect(() => service.listServices(userCtx(), { siteId: SITE_B }, { page: 1, pageSize: 20 })).toThrow(ForbiddenError);
  });

  it('refuses edits to decommissioned sites', async () => {
    const { repo, service } = setup();
    repo.findSite.mockResolvedValue(makeSite({ status: 'DECOMMISSIONED' }));
    await expect(service.updateSite(adminCtx(), SITE_A, { name: 'New' })).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

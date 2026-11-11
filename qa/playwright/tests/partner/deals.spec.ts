import { test, expect } from '@fixtures/test';
import { DealBuilder } from '@data/builders';
import { credentialsFor } from '@config/env';
import { portals } from '@config/portals';
import { LoginPage } from '@pages/LoginPage';
import { PartnerDealsPage } from '@pages/PartnerDealsPage';

/**
 * Enterprise Partner Portal deal registration. Registered deals are protected
 * for 90 days; a second partner cannot register the same customer domain.
 */
const PROTECTION_DAYS = 90;

test.describe('Partner deal registration @partner', () => {
  test.beforeEach(async ({ deals }) => {
    await deals.goto();
  });

  test('partner admin registers a multi-site SD-WAN deal @smoke', async ({ deals, seed, cleanup }) => {
    const draft = DealBuilder.enterprise()
      .withProducts('FIB-BIZ-1G', 'SDWAN-VC-STD')
      .withSites(5)
      .withMonthlyValue(489_500)
      .withNotes('Customer is consolidating five branch circuits before fiscal year end.')
      .build();

    const dealId = await deals.register(draft);
    expect(dealId).toMatch(/^DEAL-\d{8}$/);
    cleanup(() => seed.withdrawDeal(dealId));

    await deals.showStage('REGISTERED');
    await deals.expectDeal(draft.customerName, 'REGISTERED');
    await deals.expectProtectionWindow(draft.customerName, PROTECTION_DAYS);
  });

  test('registering an already-protected customer domain is rejected', async ({ deals, seed, cleanup }) => {
    const original = DealBuilder.enterprise().build();
    const existing = await seed.registerDeal(original);
    cleanup(() => seed.withdrawDeal(existing.id));

    const duplicate = DealBuilder.enterprise()
      .withCustomer(`${original.customerName} Holdings`, original.customerDomain)
      .build();
    const dealId = await deals.register(duplicate);
    expect(dealId).toBe('');
    await deals.expectDuplicateConflict();
  });

  test('activity notes are recorded on the deal timeline', async ({ deals, seed, cleanup }) => {
    const deal = await seed.registerDeal(DealBuilder.enterprise().build());
    cleanup(() => seed.withdrawDeal(deal.id));

    await deals.goto();
    await deals.openDeal(deal.customerName);
    await deals.addActivityNote('Site survey booked for the Conway and Benton branches.');
  });

  test('CSV export is named for the partner and date', async ({ deals }) => {
    const filename = await deals.exportVisibleDeals();
    const today = new Date().toISOString().slice(0, 10);
    expect(filename).toMatch(new RegExp(`^deals-PTR-\\d{6}-${today}\\.csv$`));
  });

  test('stage tabs filter the grid', async ({ deals, page }) => {
    await deals.showStage('WON');
    const stages = await deals.dealsGrid.getByTestId('deal-stage').evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('data-stage')),
    );
    for (const stage of stages) {
      expect(stage).toBe('WON');
    }
    await expect(page).toHaveURL(/stage=WON/);
  });
});

test.describe('Partner agent permissions @partner', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('partner agent sees deals read-only and cannot register', async ({ page }) => {
    const login = new LoginPage(page, portals.partner);
    await login.signInAndLand(credentialsFor('PARTNER_AGENT'));

    const deals = new PartnerDealsPage(page);
    await deals.goto();
    await expect(deals.registerDeal).toHaveCount(0);

    const response = await page.request.post('/api/v1/partner/deals', { data: DealBuilder.enterprise().build() });
    expect(response.status()).toBe(403);
    expect(response.headers()['content-type']).toContain('application/problem+json');
  });
});

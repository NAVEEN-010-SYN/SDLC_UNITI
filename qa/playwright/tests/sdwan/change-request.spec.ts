import { test, expect } from '@fixtures/test';
import { bandwidthChange } from '@data/builders';

/**
 * SD-WAN change request journey: capture -> preview impact -> submit for
 * approval -> approve -> scheduled into a maintenance window.
 */
test.describe('SD-WAN change requests @sdwan', () => {
  let siteName: string;

  test.beforeEach(async ({ changeRequests, seed, profile }) => {
    const sites = await seed.listSites(profile.accountId);
    const online = sites.items.find((site) => site.status === 'ONLINE' && site.vendor === 'VELOCLOUD');
    test.skip(!online, 'no ONLINE VeloCloud site on the test account');
    siteName = online!.name;
    await changeRequests.goto();
  });

  test('bandwidth upgrade is submitted for approval @smoke', async ({ changeRequests, seed, cleanup }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 500));
    expect(await changeRequests.currentBandwidthMbps()).toBeLessThan(500);
    await changeRequests.expectImpactPreview(/monthly charge will increase/i);

    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    expect(id).toMatch(/^CR-\d{8}$/);
    await changeRequests.expectStatus(id, 'PENDING_APPROVAL');
    const stored = await seed.getChangeRequest(id);
    expect(stored.type).toBe('BANDWIDTH');
  });

  test('approval schedules the change into the requested window', async ({ changeRequests, seed, cleanup }) => {
    const draft = bandwidthChange(siteName, 300);
    await changeRequests.startRequest(draft);
    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    await changeRequests.approve(id, 'Approved by QA as BUSINESS_ADMIN.');
    await changeRequests.expectStatus(id, 'SCHEDULED');

    const stored = await seed.getChangeRequest(id);
    expect(stored.status).toBe('SCHEDULED');
    expect(stored.scheduledFor).toBe(draft.scheduledFor.toISOString());
  });

  test('rejected change records the reason and is not scheduled', async ({ changeRequests, seed, cleanup }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 1000));
    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    await changeRequests.reject(id, 'Exceeds the contracted burst ceiling for this site.');
    await changeRequests.expectStatus(id, 'REJECTED');
    expect((await seed.getChangeRequest(id)).scheduledFor).toBeUndefined();
  });

  test('bandwidth above the edge model limit is blocked client-side', async ({ changeRequests }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 20_000));
    await changeRequests.submitExpectingValidation('New committed bandwidth (Mbps)', /exceeds the maximum supported/i);
  });

  test('maintenance window in the past is rejected', async ({ changeRequests }) => {
    const draft = bandwidthChange(siteName, 300);
    draft.scheduledFor = new Date(Date.now() - 3_600_000);
    await changeRequests.startRequest(draft);
    await changeRequests.submitExpectingValidation('Maintenance window start (UTC)', /must be in the future/i);
  });

  test('server-side conflict for an overlapping change is surfaced', async ({ changeRequests, page }) => {
    await page.route('**/api/v1/sdwan/change-requests', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.continue();
      }
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://errors.uniti.example/sdwan/change-window-conflict',
          title: 'Another change is already scheduled for this site',
          status: 409,
        }),
      });
    });
    await changeRequests.startRequest(bandwidthChange(siteName, 300));
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await changeRequests.expectProblem('Another change is already scheduled for this site');
  });
});

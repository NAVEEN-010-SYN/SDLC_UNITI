import { test as base, expect } from '@playwright/test';
import { ApiClient } from '@api/apiClient';
import { SeedApi } from '@api/seedApi';
import { BillingPage } from '@pages/BillingPage';
import { CataloguePage } from '@pages/CataloguePage';
import { CheckoutPage } from '@pages/CheckoutPage';
import { PartnerDealsPage } from '@pages/PartnerDealsPage';
import { SdwanChangeRequestPage } from '@pages/SdwanChangeRequestPage';
import { TicketsPage } from '@pages/TicketsPage';

type Cleanup = () => Promise<unknown>;

interface Profile {
  userId: string;
  accountId: string;
  roles: string[];
}

interface TestFixtures {
  catalogue: CataloguePage;
  checkout: CheckoutPage;
  billing: BillingPage;
  tickets: TicketsPage;
  deals: PartnerDealsPage;
  changeRequests: SdwanChangeRequestPage;
  profile: Profile;
  cleanup: (task: Cleanup) => void;
}

interface WorkerFixtures {
  seed: SeedApi;
}

/**
 * Project-wide test object. Page objects are constructed lazily per test; the
 * seeding API client is shared per worker; `cleanup` collects teardown tasks
 * that run in reverse order even when the test fails.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  seed: [
    async ({}, use) => {
      const client = await ApiClient.create();
      await use(new SeedApi(client));
      await client.dispose();
    },
    { scope: 'worker' },
  ],

  cleanup: async ({}, use, testInfo) => {
    const tasks: Cleanup[] = [];
    await use((task) => tasks.push(task));
    const failures: string[] = [];
    for (const task of tasks.reverse()) {
      try {
        await task();
      } catch (error) {
        failures.push(String(error));
      }
    }
    if (failures.length) {
      await testInfo.attach('cleanup-failures', { body: failures.join('\n'), contentType: 'text/plain' });
    }
  },

  profile: async ({ page }, use) => {
    const response = await page.request.get('/api/v1/me');
    expect(response.ok(), 'signed-in profile lookup').toBeTruthy();
    await use((await response.json()) as Profile);
  },

  catalogue: async ({ page }, use) => use(new CataloguePage(page)),
  checkout: async ({ page }, use) => use(new CheckoutPage(page)),
  billing: async ({ page }, use) => use(new BillingPage(page)),
  tickets: async ({ page }, use) => use(new TicketsPage(page)),
  deals: async ({ page }, use) => use(new PartnerDealsPage(page)),
  changeRequests: async ({ page }, use) => use(new SdwanChangeRequestPage(page)),
});

/**
 * On failure, capture the correlation id rendered by the problem banner so the
 * report links straight to the backend logs in Kibana.
 */
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }
  const banner = page.getByTestId('problem-correlation-id');
  if ((await banner.count()) > 0) {
    const correlationId = (await banner.first().textContent())?.trim();
    testInfo.annotations.push({ type: 'correlationId', description: correlationId });
  }
});

export { expect };

import { test } from '@playwright/test';
import { PortalKey, portals } from '../../src/config/portals';
import { expectAccessible, expectVisibleFocusOrder } from '../../src/support/accessibility';

/**
 * WCAG 2.2 AA scan of the key landing pages of each portal, run as the
 * portal's default persona. Unauthenticated pages are scanned with an empty
 * storage state.
 */
interface PageUnderTest {
  portal: PortalKey;
  path: string;
  name: string;
  authenticated: boolean;
}

const PAGES: PageUnderTest[] = [
  { portal: 'ecom', path: '/plans', name: 'eCom plan catalogue', authenticated: false },
  { portal: 'ecom', path: '/account/login', name: 'eCom sign-in', authenticated: false },
  { portal: 'ecom', path: '/account', name: 'eCom account home', authenticated: true },
  { portal: 'uconnect', path: '/dashboard', name: 'Uconnect dashboard', authenticated: true },
  { portal: 'uconnect', path: '/billing', name: 'Uconnect billing', authenticated: true },
  { portal: 'uconnect', path: '/support/tickets', name: 'Uconnect tickets', authenticated: true },
  { portal: 'partner', path: '/deals', name: 'Partner deals', authenticated: true },
];

for (const target of PAGES) {
  test.describe(`${target.name} @a11y`, () => {
    const portal = portals[target.portal];
    test.use({
      baseURL: portal.baseURL,
      storageState: target.authenticated ? portal.storageState : { cookies: [], origins: [] },
    });

    test('has no serious or critical WCAG violations', async ({ page }, testInfo) => {
      await page.goto(target.path);
      await page.getByRole('main').waitFor();
      await expectAccessible(page, testInfo);
    });
  });
}

test.describe('Keyboard navigation @a11y', () => {
  test.use({ baseURL: portals.ecom.baseURL, storageState: { cookies: [], origins: [] } });

  test('skip link is first in the tab order and moves focus to main', async ({ page }) => {
    await page.goto('/plans');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await skip.waitFor();
    await page.keyboard.press('Enter');
    const focusedInMain = await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement));
    test.expect(focusedInMain).toBe(true);
  });

  test('every focusable control in the header shows a focus indicator', async ({ page }) => {
    await page.goto('/plans');
    const visited = await expectVisibleFocusOrder(page, 12);
    test.expect(visited.length).toBeGreaterThan(5);
  });

  test('plan catalogue remains usable at 200% zoom without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto('/plans');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    test.expect(overflow).toBeLessThanOrEqual(0);
  });
});

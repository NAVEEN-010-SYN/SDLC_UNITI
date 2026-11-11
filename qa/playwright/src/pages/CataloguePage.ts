import { expect, Locator, Page } from '@playwright/test';
import { ServiceAddress } from '@api/domain';
import { BasePage } from './BasePage';

export type Segment = 'residential' | 'business';

/**
 * GoKinetic storefront catalogue: address qualification, plan cards and
 * add-on selection.
 */
export class CataloguePage extends BasePage {
  protected readonly path: string;

  readonly addressSearch: Locator;
  readonly addressSuggestions: Locator;
  readonly checkAvailability: Locator;
  readonly availabilityResult: Locator;
  readonly planCards: Locator;
  readonly speedFilter: Locator;
  readonly cartButton: Locator;

  constructor(page: Page, segment: Segment = 'residential') {
    super(page);
    this.path = segment === 'business' ? '/business/plans' : '/plans';
    this.addressSearch = page.getByRole('combobox', { name: 'Service address' });
    this.addressSuggestions = page.getByRole('listbox', { name: 'Address suggestions' }).getByRole('option');
    this.checkAvailability = page.getByRole('button', { name: 'Check availability' });
    this.availabilityResult = page.getByTestId('availability-result');
    this.planCards = page.getByTestId('plan-card');
    this.speedFilter = page.getByRole('group', { name: 'Filter by speed' });
    this.cartButton = page.getByRole('link', { name: /^Cart/ });
  }

  async qualifyAddress(address: ServiceAddress): Promise<void> {
    const query = `${address.line1}, ${address.city}`;
    await this.addressSearch.fill(query);
    await expect(this.addressSuggestions.first()).toBeVisible();
    await this.addressSuggestions.filter({ hasText: address.postalCode }).first().click();
    const qualification = this.waitForApi('POST', '/api/v1/catalogue/serviceability');
    await this.checkAvailability.click();
    await qualification;
    await expect(this.availabilityResult).toBeVisible();
  }

  async expectServiceable(): Promise<void> {
    await expect(this.availabilityResult).toHaveAttribute('data-serviceable', 'true');
    await expect(this.planCards.first()).toBeVisible();
  }

  async expectNotServiceable(): Promise<void> {
    await expect(this.availabilityResult).toHaveAttribute('data-serviceable', 'false');
    await expect(this.availabilityResult.getByRole('button', { name: 'Notify me when available' })).toBeVisible();
  }

  planCard(sku: string): Locator {
    return this.planCards.filter({ has: this.page.locator(`[data-sku="${sku}"]`) });
  }

  async filterBySpeed(label: '100 Mbps' | '500 Mbps' | '1 Gbps' | '2 Gbps'): Promise<void> {
    await this.speedFilter.getByRole('checkbox', { name: label }).check();
  }

  async visiblePlanNames(): Promise<string[]> {
    return this.planCards.getByRole('heading').allTextContents();
  }

  async planPrice(sku: string): Promise<string> {
    return (await this.planCard(sku).getByTestId('plan-monthly-price').textContent())?.trim() ?? '';
  }

  async selectPlan(sku: string): Promise<void> {
    const card = this.planCard(sku);
    await expect(card).toBeVisible();
    const addToCart = this.waitForApi('POST', '/api/v1/cart/items');
    await card.getByRole('button', { name: 'Choose plan' }).click();
    await addToCart;
  }

  async addOn(name: 'Whole-home Wi-Fi' | 'Home Phone' | 'Static IP'): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Customise your plan' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name }).check();
  }

  async continueToCheckout(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Customise your plan' });
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Continue' }).click();
    } else {
      await this.cartButton.click();
      await this.page.getByRole('button', { name: 'Checkout' }).click();
    }
    await this.page.waitForURL('**/checkout/**');
  }

  async cartCount(): Promise<number> {
    const badge = await this.cartButton.getByTestId('cart-count').textContent();
    return Number(badge ?? '0');
  }
}

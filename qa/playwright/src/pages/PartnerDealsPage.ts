import { expect, Locator, Page } from '@playwright/test';
import { DealStage } from '@api/domain';
import { DealDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * Enterprise Partner Portal deal registration. A partner registers an
 * opportunity, the channel team qualifies it, and the deal is protected for the
 * partner until it expires.
 */
export class PartnerDealsPage extends BasePage {
  protected readonly path = '/deals';

  readonly registerDeal: Locator;
  readonly dealsGrid: Locator;
  readonly stageTabs: Locator;
  readonly exportCsv: Locator;

  constructor(page: Page) {
    super(page);
    this.registerDeal = page.getByRole('button', { name: 'Register deal' });
    this.dealsGrid = page.getByRole('grid', { name: 'Deals' });
    this.stageTabs = page.getByRole('tablist', { name: 'Deal stage' });
    this.exportCsv = page.getByRole('button', { name: 'Export CSV' });
  }

  dealRow(customerName: string): Locator {
    return this.dealsGrid.getByRole('row').filter({ hasText: customerName });
  }

  async showStage(stage: DealStage | 'ALL'): Promise<void> {
    const label = stage === 'ALL' ? 'All' : stage.charAt(0) + stage.slice(1).toLowerCase();
    await this.stageTabs.getByRole('tab', { name: label }).click();
  }

  /**
   * Walks the three-step registration wizard and returns the new deal id.
   */
  async register(draft: DealDraft): Promise<string> {
    await this.registerDeal.click();
    const wizard = this.page.getByRole('dialog', { name: 'Register a deal' });

    await wizard.getByLabel('Customer legal name').fill(draft.customerName);
    await wizard.getByLabel('Customer website domain').fill(draft.customerDomain);
    await wizard.getByLabel('Decision-maker email').fill(draft.contactEmail);
    await wizard.getByRole('button', { name: 'Next' }).click();

    for (const sku of draft.products) {
      await wizard.getByRole('checkbox', { name: new RegExp(sku) }).check();
    }
    await wizard.getByLabel('Number of sites').fill(String(draft.siteCount));
    await wizard.getByLabel('Estimated monthly value').fill((draft.estimatedMonthlyValue.amountMinor / 100).toFixed(2));
    await wizard.getByRole('button', { name: 'Next' }).click();

    if (draft.notes) {
      await wizard.getByLabel('Notes for channel manager').fill(draft.notes);
    }
    await wizard.getByRole('checkbox', { name: /customer has consented/i }).check();
    const created = this.waitForApi('POST', '/api/v1/partner/deals');
    await wizard.getByRole('button', { name: 'Submit registration' }).click();
    const response = await created;
    if (response.status() !== 201) {
      return '';
    }
    const body = (await response.json()) as { id: string };
    await expect(wizard).toBeHidden();
    return body.id;
  }

  async expectDeal(customerName: string, stage: DealStage): Promise<void> {
    const row = this.dealRow(customerName);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('deal-stage')).toHaveAttribute('data-stage', stage);
  }

  async expectProtectionWindow(customerName: string, days: number): Promise<void> {
    const expires = await this.dealRow(customerName).getByTestId('deal-expires').getAttribute('datetime');
    expect(expires, 'deal expiry datetime attribute').not.toBeNull();
    const diffDays = Math.round((Date.parse(expires as string) - Date.now()) / 86_400_000);
    expect(diffDays).toBeGreaterThanOrEqual(days - 1);
    expect(diffDays).toBeLessThanOrEqual(days);
  }

  async expectDuplicateConflict(): Promise<void> {
    const wizard = this.page.getByRole('dialog', { name: 'Register a deal' });
    await expect(wizard.getByTestId('problem-banner')).toContainText(/already registered/i);
  }

  async openDeal(customerName: string): Promise<void> {
    await this.dealRow(customerName).getByRole('link', { name: customerName }).click();
    await expect(this.page.getByRole('heading', { level: 1 })).toHaveText(customerName);
  }

  async addActivityNote(note: string): Promise<void> {
    await this.page.getByRole('tab', { name: 'Activity' }).click();
    await this.page.getByLabel('Add a note').fill(note);
    await this.page.getByRole('button', { name: 'Post note' }).click();
    await expect(this.page.getByRole('list', { name: 'Activity timeline' })).toContainText(note);
  }

  async exportVisibleDeals(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsv.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }
}

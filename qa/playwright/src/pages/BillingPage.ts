import { Download, expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Uconnect billing: invoice list, invoice detail, PDF download and one-off
 * payments against the outstanding balance.
 */
export class BillingPage extends BasePage {
  protected readonly path = '/billing';

  readonly balanceCard: Locator;
  readonly invoicesTable: Locator;
  readonly statusFilter: Locator;
  readonly payNow: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    super(page);
    this.balanceCard = page.getByTestId('balance-card');
    this.invoicesTable = page.getByRole('table', { name: 'Invoices' });
    this.statusFilter = page.getByRole('combobox', { name: 'Invoice status' });
    this.payNow = page.getByRole('button', { name: 'Make a payment' });
    this.pagination = page.getByRole('navigation', { name: 'Pagination' });
  }

  async outstandingBalance(): Promise<string> {
    return (await this.balanceCard.getByTestId('balance-amount').textContent())?.trim() ?? '';
  }

  invoiceRows(): Locator {
    return this.tableRows(this.invoicesTable);
  }

  invoiceRow(invoiceId: string): Locator {
    return this.invoiceRows().filter({ hasText: invoiceId });
  }

  async filterByStatus(status: 'All' | 'Issued' | 'Paid' | 'Overdue'): Promise<void> {
    const reload = this.waitForApi('GET', '/invoices');
    await this.statusFilter.selectOption({ label: status });
    await reload;
  }

  async expectAllRowsHaveStatus(status: string): Promise<void> {
    const statuses = await this.invoiceRows().getByTestId('invoice-status').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const value of statuses) {
      expect(value.trim()).toBe(status);
    }
  }

  async goToPage(pageNumber: number): Promise<void> {
    const reload = this.waitForApi('GET', /invoices\?.*page=/);
    await this.pagination.getByRole('button', { name: `Page ${pageNumber}` }).click();
    await reload;
    await expect(this.pagination.getByRole('button', { name: `Page ${pageNumber}` })).toHaveAttribute('aria-current', 'page');
  }

  async openInvoice(invoiceId: string): Promise<void> {
    await this.invoiceRow(invoiceId).getByRole('link', { name: invoiceId }).click();
    await expect(this.page.getByRole('heading', { name: `Invoice ${invoiceId}` })).toBeVisible();
  }

  async invoiceLineItems(): Promise<Array<{ description: string; amount: string }>> {
    const rows = this.tableRows(this.page.getByRole('table', { name: 'Charges' }));
    const count = await rows.count();
    const items: Array<{ description: string; amount: string }> = [];
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).getByRole('cell');
      items.push({
        description: (await cells.first().textContent())?.trim() ?? '',
        amount: (await cells.last().textContent())?.trim() ?? '',
      });
    }
    return items;
  }

  async downloadInvoicePdf(invoiceId: string): Promise<Download> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.invoiceRow(invoiceId).getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${invoiceId}.pdf`);
    return download;
  }

  async payOutstandingWithSavedMethod(lastFour: string): Promise<string> {
    await this.payNow.click();
    const dialog = this.page.getByRole('dialog', { name: 'Make a payment' });
    await dialog.getByRole('radio', { name: 'Pay full balance' }).check();
    await dialog.getByRole('radio', { name: new RegExp(`ending ${lastFour}`) }).check();
    const payment = this.waitForApi('POST', '/payments');
    await dialog.getByRole('button', { name: 'Pay now' }).click();
    const response = await payment;
    expect(response.status()).toBe(202);
    const receipt = dialog.getByTestId('payment-reference');
    await expect(receipt).toBeVisible();
    return (await receipt.textContent())?.trim() ?? '';
  }
}

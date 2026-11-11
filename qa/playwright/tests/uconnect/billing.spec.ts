import * as fs from 'fs';
import { test, expect } from '@fixtures/test';
import { formatMoney } from '@data/builders';

/**
 * Uconnect billing journeys for a BUSINESS_ADMIN: balance, invoice history,
 * filtering, pagination, PDF download and payments.
 */
test.describe('Billing @uconnect', () => {
  test.beforeEach(async ({ billing }) => {
    await billing.goto();
  });

  test('invoice list matches the billing API for the signed-in account @smoke', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const rows = billing.invoiceRows();
    await expect(rows).toHaveCount(Math.min(invoices.items.length, invoices.pageSize));

    const newest = invoices.items[0];
    const row = billing.invoiceRow(newest.id);
    await expect(row).toContainText(formatMoney(newest.amountDue));
    await expect(row.getByTestId('invoice-status')).toHaveText(newest.status.charAt(0) + newest.status.slice(1).toLowerCase());
  });

  test('outstanding balance equals the sum of issued and overdue invoices', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const open = invoices.items.filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE');
    const totalMinor = open.reduce((sum, invoice) => sum + invoice.amountDue.amountMinor, 0);
    const currency = invoices.items[0]?.amountDue.currency ?? 'USD';
    expect(await billing.outstandingBalance()).toBe(formatMoney({ amountMinor: totalMinor, currency }));
  });

  test('status filter shows only paid invoices', async ({ billing }) => {
    await billing.filterByStatus('Paid');
    await billing.expectAllRowsHaveStatus('Paid');
  });

  test('pagination moves to the second page of history', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    test.skip(invoices.total <= invoices.pageSize, 'account has a single page of invoices');
    const firstPageIds = await billing.invoiceRows().getByRole('link').allTextContents();
    await billing.goToPage(2);
    const secondPageIds = await billing.invoiceRows().getByRole('link').allTextContents();
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);
  });

  test('invoice detail line items add up to the invoice total', async ({ billing, seed, profile, page }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const invoice = invoices.items[0];
    await billing.openInvoice(invoice.id);

    const items = await billing.invoiceLineItems();
    expect(items.length).toBeGreaterThan(0);
    const sumMinor = items
      .map((item) => Math.round(Number(item.amount.replace(/[^0-9.-]/g, '')) * 100))
      .reduce((a, b) => a + b, 0);
    expect(sumMinor).toBe(invoice.amountDue.amountMinor);
    await expect(page.getByTestId('invoice-total')).toHaveText(formatMoney(invoice.amountDue));
  });

  test('invoice PDF downloads with a PDF signature', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const download = await billing.downloadInvoicePdf(invoices.items[0].id);
    const file = await download.path();
    expect(file).not.toBeNull();
    const header = fs.readFileSync(file as string).subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  test('paying the balance with a saved method returns a payment reference', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    test.skip(!invoices.items.some((invoice) => invoice.status !== 'PAID'), 'nothing outstanding on this account');
    const reference = await billing.payOutstandingWithSavedMethod('4242');
    expect(reference).toMatch(/^PAY-[A-Z0-9]{10}$/);
    await billing.expectToast(/payment received/i);
  });

  test('billing API failure renders a problem banner with a correlation id', async ({ billing, page }) => {
    await page.route('**/api/v1/accounts/*/invoices*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://errors.uniti.example/billing-unavailable',
          title: 'Billing is temporarily unavailable',
          status: 503,
          correlationId: '7d0c5b2e-2f43-4d0e-9a52-0f7cd0c1f5a1',
        }),
      }),
    );
    await page.reload();
    await billing.expectProblem('Billing is temporarily unavailable');
    expect(await billing.problemCorrelationId()).toBe('7d0c5b2e-2f43-4d0e-9a52-0f7cd0c1f5a1');
  });
});

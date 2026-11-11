import { expect, Locator, Page } from '@playwright/test';
import { TicketPriority, TicketStatus } from '@api/domain';
import { TicketDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * Support tickets in Uconnect: list with filters, raise a new ticket, view the
 * conversation thread and respond while a ticket is PENDING_CUSTOMER.
 */
export class TicketsPage extends BasePage {
  protected readonly path = '/support/tickets';

  readonly raiseTicket: Locator;
  readonly ticketsTable: Locator;
  readonly search: Locator;
  readonly priorityFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.raiseTicket = page.getByRole('button', { name: 'Raise a ticket' });
    this.ticketsTable = page.getByRole('table', { name: 'Support tickets' });
    this.search = page.getByRole('searchbox', { name: 'Search tickets' });
    this.priorityFilter = page.getByRole('combobox', { name: 'Priority' });
  }

  row(ticketIdOrSubject: string): Locator {
    return this.tableRows(this.ticketsTable).filter({ hasText: ticketIdOrSubject });
  }

  async create(draft: TicketDraft, serviceLabel?: string): Promise<string> {
    await this.raiseTicket.click();
    const form = this.page.getByRole('dialog', { name: 'Raise a ticket' });
    await form.getByLabel('Category').selectOption(draft.category);
    if (serviceLabel) {
      await form.getByLabel('Affected service').selectOption({ label: serviceLabel });
    }
    await form.getByLabel('Subject').fill(draft.subject);
    await form.getByLabel('Describe the issue').fill(draft.description);
    await form.getByRole('radiogroup', { name: 'Impact' }).getByRole('radio', { name: impactLabel(draft.priority) }).check();
    const created = this.waitForApi('POST', /\/tickets$/);
    await form.getByRole('button', { name: 'Submit ticket' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    await expect(form).toBeHidden();
    await this.expectToast(`Ticket ${body.id} created`);
    return body.id;
  }

  async submitEmptyForm(): Promise<Locator> {
    await this.raiseTicket.click();
    const form = this.page.getByRole('dialog', { name: 'Raise a ticket' });
    await form.getByRole('button', { name: 'Submit ticket' }).click();
    return form;
  }

  async searchFor(text: string): Promise<void> {
    const reload = this.waitForApi('GET', /tickets\?/);
    await this.search.fill(text);
    await this.search.press('Enter');
    await reload;
  }

  async filterByPriority(priority: TicketPriority): Promise<void> {
    await this.priorityFilter.selectOption(priority);
  }

  async expectRow(ticketId: string, status: TicketStatus, priority: TicketPriority): Promise<void> {
    const row = this.row(ticketId);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('ticket-status')).toHaveAttribute('data-status', status);
    await expect(row.getByTestId('ticket-priority')).toHaveText(priority);
  }

  async open(ticketId: string): Promise<void> {
    await this.row(ticketId).getByRole('link', { name: ticketId }).click();
    await expect(this.page.getByRole('heading', { name: new RegExp(ticketId) })).toBeVisible();
  }

  get thread(): Locator {
    return this.page.getByRole('feed', { name: 'Ticket conversation' }).getByRole('article');
  }

  async reply(message: string, attachment?: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.page.getByLabel('Your reply').fill(message);
    if (attachment) {
      await this.page.getByLabel('Attach files').setInputFiles(attachment);
      await expect(this.page.getByTestId('attachment-chip')).toBeVisible();
    }
    const send = this.waitForApi('POST', /\/comments$/);
    await this.page.getByRole('button', { name: 'Send reply' }).click();
    await send;
    await expect(this.thread.last()).toContainText(message);
  }

  async markResolved(): Promise<void> {
    await this.page.getByRole('button', { name: 'Mark as resolved' }).click();
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(this.page.getByTestId('ticket-detail-status')).toHaveAttribute('data-status', 'RESOLVED');
  }
}

function impactLabel(priority: TicketPriority): string {
  switch (priority) {
    case 'P1':
      return 'Total outage';
    case 'P2':
      return 'Severely degraded';
    case 'P3':
      return 'Partially affected';
    case 'P4':
      return 'Question or request';
  }
}

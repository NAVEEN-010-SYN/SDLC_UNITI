import { test, expect } from '@fixtures/test';
import { TicketBuilder } from '@data/builders';

/**
 * Support ticket lifecycle in Uconnect:
 * OPEN -> IN_PROGRESS -> PENDING_CUSTOMER -> RESOLVED -> CLOSED.
 */
test.describe('Support tickets @uconnect', () => {
  test.beforeEach(async ({ tickets }) => {
    await tickets.goto();
  });

  test('raise a connectivity ticket from the portal @smoke', async ({ tickets, seed, cleanup }) => {
    const draft = TicketBuilder.connectivity().withPriority('P2').build();
    const ticketId = await tickets.create(draft);
    cleanup(() => seed.closeTicket(ticketId));

    expect(ticketId).toMatch(/^TCK-\d{8}$/);
    await tickets.expectRow(ticketId, 'OPEN', 'P2');

    const stored = await seed.getTicket(ticketId);
    expect(stored.subject).toBe(draft.subject);
    expect(stored.category).toBe('CONNECTIVITY');
  });

  test('required fields are validated before submission', async ({ tickets }) => {
    const form = await tickets.submitEmptyForm();
    await expect(form.getByLabel('Subject')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Describe the issue')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByRole('alert')).toContainText('Please fix 2 errors');
  });

  test('ticket created via API appears in search results', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.billingDispute().build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.searchFor(created.id);
    await tickets.expectRow(created.id, 'OPEN', 'P3');
    await expect(tickets.row(created.id)).toContainText('Duplicate charge');
  });

  test('priority filter shows only matching tickets', async ({ tickets, seed, profile, cleanup }) => {
    const p1 = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P1').build());
    const p4 = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P4').build());
    cleanup(() => seed.closeTicket(p1.id));
    cleanup(() => seed.closeTicket(p4.id));

    await tickets.goto();
    await tickets.filterByPriority('P1');
    await expect(tickets.row(p1.id)).toBeVisible();
    await expect(tickets.row(p4.id)).toHaveCount(0);
  });

  test('customer reply with attachment is added to the thread', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.goto();
    await tickets.open(created.id);
    const ontLog = [
      '2026-11-10T18:02:11Z LOS alarm raised on PON port 1',
      '2026-11-10T18:02:47Z LOS alarm cleared, ranging complete',
      '2026-11-10T19:15:03Z LOS alarm raised on PON port 1',
    ].join('\n');
    await tickets.reply('ONT event log attached. The PON light flashes red during the drop-outs.', {
      name: 'ont-events.log',
      mimeType: 'text/plain',
      buffer: Buffer.from(ontLog, 'utf-8'),
    });
    await expect(tickets.thread).toHaveCount(2);
    await expect(tickets.thread.last().getByRole('link', { name: 'ont-events.log' })).toBeVisible();
  });

  test('customer can resolve their own ticket', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P4').build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.goto();
    await tickets.open(created.id);
    await tickets.markResolved();

    const stored = await seed.getTicket(created.id);
    expect(stored.status).toBe('RESOLVED');
  });

  test('tickets belonging to another account are not reachable', async ({ page }) => {
    const response = await page.goto('/support/tickets/TCK-00000001');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /ticket not found/i })).toBeVisible();
  });
});

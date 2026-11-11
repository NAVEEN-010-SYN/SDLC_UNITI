import { Invoice, InvoiceLine } from '../../clients/platformClients';
import { formatMoney, subtractMoney } from '../../domain/money';
import { BotReply } from '../../domain/types';
import { invoiceIdSlot } from '../slots';
import { END, FlowContext, FlowDefinition } from '../stateMachine';
import { downstreamFailure, formatDate, ticketQuickReply } from './common';

/**
 * Bill enquiry: fetches the latest (or a named) invoice, summarises it, explains
 * the change versus the previous invoice, and optionally lists line items or
 * raises a billing query ticket.
 */

const INVOICE_KEY = 'invoice';
const PREVIOUS_KEY = 'previousInvoice';

export interface BillChange {
  delta: number;
  oneOffLines: InvoiceLine[];
  newRecurring: InvoiceLine[];
}

/** Explains why a bill differs from the previous one, using integer minor units only. */
export function explainChange(current: Invoice, previous: Invoice | undefined): BillChange | undefined {
  if (!previous || previous.total.currency !== current.total.currency) return undefined;
  const delta = subtractMoney(current.total, previous.total).amountMinor;
  const previousRecurring = new Set(previous.lines.filter((l) => l.category === 'RECURRING').map((l) => l.description));
  return {
    delta,
    oneOffLines: current.lines.filter((l) => l.category === 'ONE_OFF' || l.category === 'USAGE'),
    newRecurring: current.lines.filter((l) => l.category === 'RECURRING' && !previousRecurring.has(l.description)),
  };
}

export function summariseInvoice(invoice: Invoice, previous?: Invoice): BotReply {
  const parts = [
    `Your invoice ${invoice.invoiceId} for ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)} is ${formatMoney(invoice.total)}.`,
  ];
  if (invoice.status === 'PAID') {
    parts.push("It's been paid in full - thank you.");
  } else if (invoice.status === 'OVERDUE') {
    parts.push(`It's overdue: ${formatMoney(invoice.balanceDue)} was due on ${formatDate(invoice.dueDate)}.`);
  } else {
    parts.push(`${formatMoney(invoice.balanceDue)} is due by ${formatDate(invoice.dueDate)}.`);
  }

  const change = explainChange(invoice, previous);
  if (change && change.delta !== 0) {
    const direction = change.delta > 0 ? 'higher' : 'lower';
    const amount = formatMoney({ amountMinor: Math.abs(change.delta), currency: invoice.total.currency });
    let reason = '';
    if (change.oneOffLines.length > 0) {
      reason = ` This includes one-off charges: ${change.oneOffLines.map((l) => `${l.description} (${formatMoney(l.amount)})`).join(', ')}.`;
    } else if (change.newRecurring.length > 0) {
      reason = ` New this month: ${change.newRecurring.map((l) => l.description).join(', ')}.`;
    }
    parts.push(`That's ${amount} ${direction} than your previous bill.${reason}`);
  }

  return {
    text: parts.join(' '),
    card: {
      kind: 'INVOICE',
      invoiceId: invoice.invoiceId,
      total: invoice.total,
      dueDate: invoice.dueDate,
      status: invoice.status,
    },
  };
}

export function formatLines(invoice: Invoice): string {
  const order: InvoiceLine['category'][] = ['RECURRING', 'USAGE', 'ONE_OFF', 'DISCOUNT', 'CREDIT'];
  const sorted = [...invoice.lines].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return sorted.map((l) => `- ${l.description}: ${formatMoney(l.amount)}`).join('\n');
}

async function fetchInvoices(ctx: FlowContext): Promise<{ invoice?: Invoice; previous?: Invoice }> {
  const requested = String(ctx.slots.invoiceId);
  const accountId = ctx.principal.accountId;
  if (requested === 'LATEST') {
    const page = await ctx.clients.billing.listInvoices(accountId, ctx.request, 1, 2);
    return { invoice: page.items[0], previous: page.items[1] };
  }
  const invoice = await ctx.clients.billing.getInvoice(accountId, requested, ctx.request);
  return { invoice };
}

export const billEnquiryFlow: FlowDefinition = {
  id: 'bill_enquiry',
  intent: 'BILL_ENQUIRY',
  label: 'your bill',
  initial: 'invoiceId',
  allowedRoles: ['CONSUMER', 'BUSINESS_ADMIN', 'PARTNER_ADMIN', 'WHOLESALE_BUYER', 'SUPPORT_AGENT'],
  states: {
    invoiceId: {
      kind: 'slot',
      slot: 'invoiceId',
      validator: invoiceIdSlot,
      autofill: async () => 'LATEST',
      prompt: { text: 'Which invoice? Say "latest" or give the invoice number.', quickReplies: [{ label: 'Latest', payload: 'latest' }] },
      next: 'fetch',
    },
    fetch: {
      kind: 'action',
      async run(ctx) {
        let result: { invoice?: Invoice; previous?: Invoice };
        try {
          result = await fetchInvoices(ctx);
        } catch (error) {
          return downstreamFailure(ctx, error, 'fetch your bill');
        }
        if (!result.invoice) {
          return { replies: [{ text: "You don't have any invoices yet. Your first bill is issued a month after activation." }], next: END, outcome: 'no_invoices' };
        }
        ctx.scratch[INVOICE_KEY] = result.invoice;
        ctx.scratch[PREVIOUS_KEY] = result.previous;
        ctx.slots.resolvedInvoiceId = result.invoice.invoiceId;
        return { replies: [summariseInvoice(result.invoice, result.previous)], next: 'breakdownOffer', outcome: 'bill_explained' };
      },
    },
    breakdownOffer: {
      kind: 'confirm',
      prompt: { text: 'Would you like to see the full breakdown?', quickReplies: [{ label: 'Yes', payload: 'yes' }, { label: 'No', payload: 'no' }] },
      onYes: 'breakdown',
      onNo: 'disputeOffer',
    },
    breakdown: {
      kind: 'action',
      async run(ctx) {
        let invoice = ctx.scratch[INVOICE_KEY] as Invoice | undefined;
        if (!invoice) {
          try {
            invoice = await ctx.clients.billing.getInvoice(ctx.principal.accountId, String(ctx.slots.resolvedInvoiceId), ctx.request);
          } catch (error) {
            return downstreamFailure(ctx, error, 'load the breakdown');
          }
        }
        return { replies: [{ text: `Here's what's on invoice ${invoice.invoiceId}:\n${formatLines(invoice)}` }], next: 'disputeOffer' };
      },
    },
    disputeOffer: {
      kind: 'confirm',
      prompt: { text: 'Does anything on this bill look wrong?', quickReplies: [{ label: 'Yes, query it', payload: 'yes' }, { label: 'No, all good', payload: 'no' }] },
      onYes: 'raiseQuery',
      onNo: 'done',
    },
    raiseQuery: {
      kind: 'action',
      async run(ctx) {
        try {
          const ticket = await ctx.clients.tickets.createTicket(
            {
              accountId: ctx.principal.accountId,
              category: 'BILLING',
              priority: 'P3',
              subject: `Billing query on ${ctx.slots.resolvedInvoiceId}`,
              description: 'Customer queried charges on this invoice via the chatbot.',
              source: 'CHATBOT',
              conversationId: ctx.conversation.id,
            },
            ctx.request,
            ctx.idempotencyKey(`billing-query-${ctx.slots.resolvedInvoiceId}`),
          );
          return {
            replies: [
              {
                text: `I've raised billing query ${ticket.ticketId}. Our billing team will reply within 2 working days, and any agreed credit will appear on your next bill.`,
                card: { kind: 'TICKET', ticketId: ticket.ticketId, priority: ticket.priority, status: ticket.status },
              },
            ],
            next: END,
            outcome: 'ticket_created',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'raise the billing query');
        }
      },
    },
    done: {
      kind: 'action',
      run: async () => ({
        replies: [{ text: 'Great. Anything else I can help with?', quickReplies: [ticketQuickReply()] }],
        next: END,
        outcome: 'resolved',
      }),
    },
  },
};

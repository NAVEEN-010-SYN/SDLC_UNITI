import { CreateTicketRequest } from '../../clients/platformClients';
import { Principal, TicketPriority } from '../../domain/types';
import { choiceSlot, freeTextSlot, phoneSlot } from '../slots';
import { END, FlowDefinition } from '../stateMachine';
import { downstreamFailure, isBusinessUser } from './common';

/**
 * Raise ticket: collects category, description and a callback number, shows a
 * summary for confirmation and creates the ticket with a derived priority.
 */

export const TICKET_CATEGORIES: Array<{ key: CreateTicketRequest['category']; label: string; aliases: string[] }> = [
  { key: 'FAULT', label: 'Fault with my service', aliases: ['fault', 'broken', 'not working', 'technical'] },
  { key: 'BILLING', label: 'Billing or payments', aliases: ['billing', 'bill', 'payment', 'charge'] },
  { key: 'COMPLAINT', label: 'Make a complaint', aliases: ['complaint', 'complain', 'unhappy'] },
  { key: 'GENERAL', label: 'Something else', aliases: ['other', 'general', 'question'] },
];

const TOTAL_LOSS_CUES = ['no service', 'completely down', 'no internet', 'total outage', 'nothing works', 'all sites down', 'phones down'];
const DEGRADED_CUES = ['slow', 'intermittent', 'dropping', 'drops out', 'keeps disconnecting', 'buffering'];

/**
 * Priority rules (CONVENTIONS: P1..P4):
 *  - P1 is reserved for NOC-raised major incidents and never set by the chatbot.
 *  - Business total loss of service -> P2; consumer total loss -> P3.
 *  - Degraded service -> P3; complaints -> P3; everything else -> P4.
 */
export function derivePriority(category: CreateTicketRequest['category'], description: string, principal: Principal): TicketPriority {
  const text = description.toLowerCase();
  const totalLoss = TOTAL_LOSS_CUES.some((cue) => text.includes(cue));
  const degraded = DEGRADED_CUES.some((cue) => text.includes(cue));
  if (category === 'FAULT') {
    if (totalLoss) return isBusinessUser(principal.roles) ? 'P2' : 'P3';
    if (degraded) return 'P3';
    return 'P4';
  }
  if (category === 'COMPLAINT') return 'P3';
  if (category === 'BILLING') return 'P3';
  return 'P4';
}

export function buildSubject(category: CreateTicketRequest['category'], description: string): string {
  const label = TICKET_CATEGORIES.find((c) => c.key === category)?.label ?? 'Support request';
  const firstSentence = description.split(/[.!?\n]/)[0].trim();
  const snippet = firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}...` : firstSentence;
  return `${label}: ${snippet}`;
}

const RESPONSE_TIMES: Record<TicketPriority, string> = {
  P1: '1 hour',
  P2: '4 hours',
  P3: '1 working day',
  P4: '3 working days',
};

export const raiseTicketFlow: FlowDefinition = {
  id: 'raise_ticket',
  intent: 'RAISE_TICKET',
  label: 'raising a ticket',
  initial: 'category',
  states: {
    category: {
      kind: 'slot',
      slot: 'category',
      validator: choiceSlot(() => TICKET_CATEGORIES),
      prompt: {
        text: `What's the ticket about?\n${TICKET_CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`,
        quickReplies: TICKET_CATEGORIES.map((c) => ({ label: c.label, payload: c.key })),
      },
      next: 'description',
    },
    description: {
      kind: 'slot',
      slot: 'description',
      validator: freeTextSlot(15, 1000),
      captureFreeText: true,
      prompt: { text: 'Please describe the problem in a sentence or two - when it started and what you\'ve tried helps us most.' },
      next: 'phone',
    },
    phone: {
      kind: 'slot',
      slot: 'contactPhone',
      validator: phoneSlot,
      prompt: { text: 'What number can our team call you back on?' },
      next: 'confirm',
    },
    confirm: {
      kind: 'confirm',
      prompt(ctx) {
        const category = String(ctx.slots.category) as CreateTicketRequest['category'];
        const priority = derivePriority(category, String(ctx.slots.description), ctx.principal);
        ctx.slots.priority = priority;
        return {
          text:
            `Here's your ticket:\n- Type: ${TICKET_CATEGORIES.find((c) => c.key === category)?.label}\n` +
            `- Details: ${ctx.slots.description}\n- Callback: ${ctx.slots.contactPhone}\n` +
            `- Expected response: within ${RESPONSE_TIMES[priority]}\nShall I submit it?`,
          quickReplies: [
            { label: 'Submit', payload: 'yes' },
            { label: 'Cancel', payload: 'no' },
          ],
        };
      },
      onYes: 'create',
      onNo: 'cancelled',
    },
    create: {
      kind: 'action',
      async run(ctx) {
        const category = String(ctx.slots.category) as CreateTicketRequest['category'];
        const description = String(ctx.slots.description);
        const priority = (ctx.slots.priority as TicketPriority | undefined) ?? derivePriority(category, description, ctx.principal);
        try {
          const ticket = await ctx.clients.tickets.createTicket(
            {
              accountId: ctx.principal.accountId,
              category,
              priority,
              subject: buildSubject(category, description),
              description,
              contactPhone: String(ctx.slots.contactPhone),
              serviceId: ctx.slots.serviceId ? String(ctx.slots.serviceId) : undefined,
              source: 'CHATBOT',
              conversationId: ctx.conversation.id,
            },
            ctx.request,
            ctx.idempotencyKey('ticket'),
          );
          ctx.slots.ticketId = ticket.ticketId;
          return {
            replies: [
              {
                text: `Your ticket ${ticket.ticketId} is open (priority ${ticket.priority}). We'll be in touch within ${RESPONSE_TIMES[ticket.priority]}. You can track it under Support in your portal.`,
                card: { kind: 'TICKET', ticketId: ticket.ticketId, priority: ticket.priority, status: ticket.status },
              },
            ],
            next: END,
            outcome: 'ticket_created',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'create your ticket');
        }
      },
    },
    cancelled: {
      kind: 'action',
      run: async () => ({ replies: [{ text: "OK, I haven't raised anything. Let me know if you change your mind." }], next: END, outcome: 'cancelled' }),
    },
  },
};

import { Principal } from '../../domain/types';
import { freeTextSlot } from '../slots';
import { END, FlowDefinition } from '../stateMachine';
import { downstreamFailure, isBusinessUser, isPartnerUser, ticketQuickReply } from './common';

/**
 * Talk to agent: captures a short reason, checks contact-centre opening hours
 * for the customer's queue, and either hands the conversation to a live agent
 * (creating a HANDOFF ticket carrying the context) or offers a callback ticket.
 */

export interface OpeningHours {
  /** 0 = Sunday ... 6 = Saturday; [openHour, closeHour) in Europe/London local time. */
  [weekday: number]: [number, number] | undefined;
}

export const QUEUE_HOURS: Record<string, OpeningHours> = {
  'consumer-support': { 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [9, 17] },
  'business-support': { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] },
  'partner-desk': { 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18] },
};

export function queueFor(principal: Principal): string {
  if (isPartnerUser(principal.roles) || principal.roles.includes('WHOLESALE_BUYER')) return 'partner-desk';
  if (isBusinessUser(principal.roles)) return 'business-support';
  return 'consumer-support';
}

/** Returns weekday and hour in Europe/London regardless of server timezone. */
export function londonTime(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  return { weekday, hour };
}

export function isQueueOpen(queue: string, now: Date): boolean {
  const hours = QUEUE_HOURS[queue];
  if (!hours) return false;
  const { weekday, hour } = londonTime(now);
  const window = hours[weekday];
  return window !== undefined && hour >= window[0] && hour < window[1];
}

/** Clock is injectable so tests can pin opening hours. */
export function createAgentHandoffFlow(clock: () => Date = () => new Date()): FlowDefinition {
  return {
    id: 'agent_handoff',
    intent: 'TALK_TO_AGENT',
    label: 'connecting you to an agent',
    initial: 'reason',
    states: {
      reason: {
        kind: 'slot',
        slot: 'reason',
        validator: freeTextSlot(3, 300),
        captureFreeText: true,
        autofill: async (ctx) => {
          // Coming from a failed flow, the reason is already known.
          const last = ctx.conversation.lastIntent;
          return last && last !== 'TALK_TO_AGENT' && last !== 'FALLBACK' ? `Continuing from ${last.toLowerCase().replace(/_/g, ' ')}` : undefined;
        },
        prompt: { text: 'Sure - so I can pass it on, what do you need help with?' },
        next: 'route',
      },
      route: {
        kind: 'action',
        async run(ctx) {
          const queue = queueFor(ctx.principal);
          ctx.slots.queue = queue;
          if (!isQueueOpen(queue, clock())) {
            return {
              replies: [
                {
                  text: "Our team isn't available right now. I can raise a ticket so they call you back first thing.",
                  quickReplies: [ticketQuickReply()],
                },
              ],
              next: END,
              outcome: 'out_of_hours',
            };
          }
          return { next: 'handoff' };
        },
      },
      handoff: {
        kind: 'action',
        async run(ctx) {
          const queue = String(ctx.slots.queue);
          const reason = String(ctx.slots.reason);
          try {
            const ticket = await ctx.clients.tickets.createTicket(
              {
                accountId: ctx.principal.accountId,
                category: 'HANDOFF',
                priority: queue === 'business-support' ? 'P3' : 'P4',
                subject: `Chat handoff: ${reason.slice(0, 80)}`,
                description: `Customer asked for a live agent from the chatbot. Reason: ${reason}`,
                source: 'CHATBOT',
                conversationId: ctx.conversation.id,
              },
              ctx.request,
              ctx.idempotencyKey('handoff'),
            );
            return {
              replies: [{ text: "I'm connecting you to the next available agent - they'll see our chat so far, so you won't need to repeat yourself." }],
              next: END,
              handoff: { queue, reason, ticketId: ticket.ticketId },
              outcome: 'handed_off',
            };
          } catch (error) {
            return downstreamFailure(ctx, error, 'reach an agent');
          }
        },
      },
    },
  };
}

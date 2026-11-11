import { USER_ID, AGENT_ID } from '../../test/fixtures';
import { makeTicket } from '../../test/ticket-fixtures';
import { TicketEvent } from '../tickets/tickets.types';
import { Outbox, OutboxMessage, outboxTicketNotifier } from './outbox';

function recordingOutbox(): Outbox & { messages: OutboxMessage[] } {
  const messages: OutboxMessage[] = [];
  return { messages, enqueue: async (m) => void messages.push(m) };
}

function event(overrides: Partial<TicketEvent> = {}): TicketEvent {
  return {
    id: 1,
    ticketId: makeTicket().id,
    kind: 'STATUS_CHANGE',
    authorId: AGENT_ID,
    body: null,
    fromValue: 'OPEN',
    toValue: 'IN_PROGRESS',
    internal: false,
    createdAt: '2024-06-03T10:00:00.000Z',
    ...overrides
  };
}

describe('outboxTicketNotifier', () => {
  it('notifies the raiser about agent updates', async () => {
    const outbox = recordingOutbox();
    await outboxTicketNotifier(outbox).ticketUpdated(makeTicket(), event());
    expect(outbox.messages).toEqual([
      expect.objectContaining({ kind: 'TICKET_UPDATED', recipient: USER_ID, payload: expect.objectContaining({ toValue: 'IN_PROGRESS' }) })
    ]);
  });

  it('skips internal notes and the raiser’s own actions', async () => {
    const outbox = recordingOutbox();
    const notifier = outboxTicketNotifier(outbox);
    await notifier.ticketUpdated(makeTicket(), event({ internal: true }));
    await notifier.ticketUpdated(makeTicket(), event({ authorId: USER_ID }));
    expect(outbox.messages).toHaveLength(0);
  });
});

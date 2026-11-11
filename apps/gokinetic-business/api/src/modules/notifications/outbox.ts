import { Db } from '../../db/query';
import { currentCorrelationId } from '../../lib/logger';
import { TicketNotifier } from '../tickets/tickets.service';
import { Ticket, TicketEvent } from '../tickets/tickets.types';
import { InvitationSender } from '../users/users.service';
import { BusinessUser } from '../users/users.types';

export type NotificationKind = 'USER_INVITATION' | 'TICKET_UPDATED';

export interface OutboxMessage {
  accountId: string;
  kind: NotificationKind;
  /** An email address, or a user id the relay resolves to the user's current address. */
  recipient: string;
  payload: Record<string, unknown>;
}

export interface Outbox {
  enqueue(message: OutboxMessage): Promise<void>;
}

export function createOutbox(db: Db): Outbox {
  return {
    async enqueue(message) {
      await db.exec(
        `INSERT INTO notification_outbox (account_id, kind, recipient, payload, correlation_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [message.accountId, message.kind, message.recipient, JSON.stringify(message.payload), currentCorrelationId() ?? null]
      );
    }
  };
}

export function outboxInvitationSender(outbox: Outbox): InvitationSender {
  return {
    sendInvitation: (user: BusinessUser, invitedByEmail: string) =>
      outbox.enqueue({
        accountId: user.accountId,
        kind: 'USER_INVITATION',
        recipient: user.email,
        payload: { userId: user.id, firstName: user.firstName, role: user.role, invitedBy: invitedByEmail }
      })
  };
}

/** Customers hear about public changes to their tickets; the author of an event is never notified of their own action. */
export function outboxTicketNotifier(outbox: Outbox): TicketNotifier {
  return {
    async ticketUpdated(ticket: Ticket, event: TicketEvent) {
      if (event.internal || event.authorId === ticket.raisedBy) return;
      await outbox.enqueue({
        accountId: ticket.accountId,
        kind: 'TICKET_UPDATED',
        recipient: ticket.raisedBy,
        payload: {
          ticketId: ticket.id,
          reference: ticket.reference,
          subject: ticket.subject,
          status: ticket.status,
          eventKind: event.kind,
          toValue: event.toValue
        }
      });
    }
  };
}

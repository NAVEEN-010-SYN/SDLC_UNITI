import { Ticket } from '../modules/tickets/tickets.types';
import { ACCOUNT_ID, USER_ID } from './fixtures';

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    accountId: ACCOUNT_ID,
    reference: 'TKT-20240603-ABCDEF',
    category: 'FAULT',
    priority: 'P2',
    status: 'OPEN',
    serviceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subject: 'Line down at HQ',
    description: 'No sync on the ONT since 09:00 this morning.',
    raisedBy: USER_ID,
    contactPhone: null,
    escalationLevel: 0,
    slaTier: 'STANDARD',
    openedAt: '2024-06-03T09:00:00.000Z',
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    pendingSince: null,
    pausedMs: 0,
    responseDueAt: '2024-06-03T11:00:00.000Z',
    resolutionDueAt: '2024-06-04T09:00:00.000Z',
    version: 1,
    ...overrides
  };
}

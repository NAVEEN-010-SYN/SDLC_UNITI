import { makeTicket } from '../../test/ticket-fixtures';
import { automaticEscalationLevel, computeDueDates, effectivePausedMs, slaView } from './ticket-sla';
import { canTransitionTicket, isClockRunning, nextStatusesFor } from './ticket-state-machine';

describe('computeDueDates', () => {
  it('uses a continuous clock for P2 standard tickets', () => {
    const due = computeDueDates('STANDARD', 'P2', new Date('2024-06-03T09:00:00Z'));
    expect(due.responseDueAt.toISOString()).toBe('2024-06-03T11:00:00.000Z');
    expect(due.resolutionDueAt.toISOString()).toBe('2024-06-04T09:00:00.000Z');
  });

  it('uses business hours for P3, rolling over the weekend', () => {
    // Friday 16:00 + 8 business hours => Monday 14:00
    const due = computeDueDates('STANDARD', 'P3', new Date('2024-06-07T16:00:00Z'));
    expect(due.responseDueAt.toISOString()).toBe('2024-06-10T14:00:00.000Z');
  });

  it('extends only the resolution target by paused time', () => {
    const opened = new Date('2024-06-03T09:00:00Z');
    const due = computeDueDates('PREMIUM', 'P1', opened, 30 * 60_000);
    expect(due.responseDueAt.toISOString()).toBe('2024-06-03T09:15:00.000Z');
    expect(due.resolutionDueAt.toISOString()).toBe('2024-06-03T13:30:00.000Z');
  });
});

describe('effectivePausedMs', () => {
  it('adds the open pending window to accumulated pause', () => {
    const t = makeTicket({ pausedMs: 60_000, pendingSince: '2024-06-03T10:00:00.000Z' });
    expect(effectivePausedMs(t, new Date('2024-06-03T10:05:00Z'))).toBe(6 * 60_000);
  });

  it('returns accumulated pause when not pending', () => {
    expect(effectivePausedMs(makeTicket({ pausedMs: 42 }), new Date())).toBe(42);
  });
});

describe('slaView', () => {
  it('reports on-track early in the life of a ticket', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T09:30:00Z'));
    expect(view.response.state).toBe('ON_TRACK');
    expect(view.response.consumedBps).toBe(2_500);
    expect(view.resolution.state).toBe('ON_TRACK');
  });

  it('flags at-risk once 75% of the response target is used', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T10:40:00Z'));
    expect(view.response.state).toBe('AT_RISK');
  });

  it('reports breached response after the due time without a reply', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T11:01:00Z'));
    expect(view.response.state).toBe('BREACHED');
  });

  it('reports MET when the first response landed before the due time', () => {
    const view = slaView(makeTicket({ firstResponseAt: '2024-06-03T10:00:00.000Z' }), new Date('2024-06-03T15:00:00Z'));
    expect(view.response.state).toBe('MET');
  });

  it('reports PAUSED resolution while waiting on the customer', () => {
    const ticket = makeTicket({ status: 'PENDING_CUSTOMER', pendingSince: '2024-06-03T10:00:00.000Z', firstResponseAt: '2024-06-03T09:10:00.000Z' });
    expect(slaView(ticket, new Date('2024-06-03T12:00:00Z')).resolution.state).toBe('PAUSED');
  });
});

describe('automaticEscalationLevel', () => {
  it.each([
    [0, 0],
    [4_999, 0],
    [5_000, 1],
    [7_500, 2],
    [12_000, 3]
  ])('maps %i bps consumed to level %i', (consumed, level) => {
    expect(automaticEscalationLevel(consumed)).toBe(level);
  });
});

describe('ticket state machine', () => {
  it('lets agents move work states but not customers', () => {
    expect(canTransitionTicket('OPEN', 'IN_PROGRESS', 'agent')).toBe(true);
    expect(canTransitionTicket('OPEN', 'IN_PROGRESS', 'customer')).toBe(false);
  });

  it('lets customers confirm or reopen a resolution', () => {
    expect(nextStatusesFor('RESOLVED', 'customer').sort()).toEqual(['CLOSED', 'IN_PROGRESS']);
  });

  it('treats CLOSED as terminal', () => {
    expect(nextStatusesFor('CLOSED', 'agent')).toEqual([]);
  });

  it('only runs the clock while the ticket is being worked', () => {
    expect(isClockRunning('OPEN')).toBe(true);
    expect(isClockRunning('PENDING_CUSTOMER')).toBe(false);
    expect(isClockRunning('RESOLVED')).toBe(false);
  });
});

import { DownstreamError } from '../../domain/errors';
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account } from '../../testing/fakes';
import { describeOutage } from './checkOutage';

describe('check outage flow', () => {
  it('uses the postcode from the utterance and offers troubleshooting when there is no incident', async () => {
    const chat = new ChatHarness();
    const first = await chat.say('is there an outage at M1 1AE');
    expect(chat.clients.network.outageQueries).toEqual(['M1 1AE']);
    expect(first.text).toContain('no known issues at M1 1AE');
    expect(chat.awaiting).toBe('faultOffer');

    const second = await chat.say('yes');
    expect(second.replies[0].quickReplies?.map((q) => q.payload)).toEqual(
      expect.arrayContaining(['intent:RESET_ROUTER', 'intent:RAISE_TICKET', 'intent:TALK_TO_AGENT']),
    );
    expect(outcomeOf(second, 'check_outage')).toBe('troubleshoot_offered');
    expect(chat.activeFlowId).toBeUndefined();
  });

  it("autofills the postcode from the customer's only active service", async () => {
    const chat = new ChatHarness();
    await chat.say('my internet is down');
    expect(chat.clients.network.outageQueries).toEqual(['SW1A 1AA']);
  });

  it('asks for a postcode when services span several addresses, and re-asks on invalid input', async () => {
    const chat = new ChatHarness();
    const base = account().services[0];
    chat.clients.account.summary = account({
      services: [base, { ...base, serviceId: 'SVC-2', serviceAddress: { line1: '2 Mill Lane', town: 'Leeds', postcode: 'LS1 4AP' } }],
    });

    const prompt = await chat.say('no internet');
    expect(prompt.text).toContain('Which postcode should I check?');

    const invalid = await chat.say('somewhere near leeds');
    expect(invalid.text).toContain("doesn't look like a valid UK postcode");
    expect(chat.awaiting).toBe('postcode');

    await chat.say('ls14ap');
    expect(chat.clients.network.outageQueries).toEqual(['LS1 4AP']);
  });

  it('subscribes the customer to a restoration SMS during a live outage', async () => {
    const chat = new ChatHarness();
    chat.clients.network.outage = {
      postcode: 'SW1A 1AA',
      region: 'Westminster',
      status: 'OUTAGE',
      summary: 'Fibre cable damaged by roadworks',
      estimatedRestore: '2026-11-09T16:00:00Z',
    };

    const report = await chat.say('my internet is down');
    expect(report.text).toContain('known outage affecting Westminster');
    expect(report.text).toContain('Fibre cable damaged by roadworks');
    expect(report.replies[0].card).toMatchObject({ kind: 'OUTAGE', status: 'OUTAGE', region: 'Westminster' });

    await chat.say('yes');
    expect(chat.awaiting).toBe('phone');

    const done = await chat.say('07700 900123');
    expect(done.text).toContain("we'll text you");
    const [ticket] = chat.clients.tickets.created;
    expect(ticket.request).toMatchObject({ category: 'FAULT', priority: 'P4', contactPhone: '07700900123', source: 'CHATBOT' });
    expect(ticket.key).toMatch(/^chatbot:.+:outage-sms$/);
    expect(outcomeOf(done, 'check_outage')).toBe('outage_subscribed');
  });

  it('ends gracefully and offers an agent when the network API fails', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'getOutageStatus').mockRejectedValue(new DownstreamError('network-api', 503, 'unavailable'));

    const turn = await chat.say('is there an outage at M1 1AE');
    expect(turn.text).toContain("couldn't check the network status");
    expect(turn.replies[0].quickReplies?.[0].payload).toBe('intent:TALK_TO_AGENT');
    expect(outcomeOf(turn, 'check_outage')).toBe('downstream_error');
  });

  it('propagates unexpected (non-downstream) errors instead of masking them', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'getOutageStatus').mockRejectedValue(new TypeError('bug'));
    await expect(chat.say('is there an outage at M1 1AE')).rejects.toThrow(TypeError);
  });
});

describe('describeOutage', () => {
  const base = { postcode: 'SW1A 1AA', region: 'Westminster' };

  it.each([
    ['PLANNED_WORK', 'planned maintenance in Westminster'],
    ['INVESTIGATING', 'investigating reports of problems in Westminster'],
    ['RESTORED', 'has been fixed'],
    ['NO_KNOWN_ISSUES', 'no known issues at SW1A 1AA'],
  ] as const)('describes %s', (status, expected) => {
    expect(describeOutage({ ...base, status })).toContain(expected);
  });

  it('omits the restore estimate when none is known', () => {
    expect(describeOutage({ ...base, status: 'OUTAGE' })).not.toContain('restored by');
  });
});

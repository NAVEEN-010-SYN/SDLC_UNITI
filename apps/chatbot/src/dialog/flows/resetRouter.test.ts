import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account } from '../../testing/fakes';
import { diagnose, OPTICAL_MAX_DBM, OPTICAL_MIN_DBM } from './resetRouter';

const healthy = { serviceId: 'SVC-1', ontOnline: true, routerOnline: true, lastSeen: '2026-11-11T09:59:00Z', opticalSignalDbm: -18 };

describe('diagnose', () => {
  it('prioritises an offline ONT over every other symptom', () => {
    expect(diagnose({ ...healthy, ontOnline: false, routerOnline: false, opticalSignalDbm: -40 })).toBe('ONT_OFFLINE');
  });

  it('flags optical power outside the healthy band as a fibre fault', () => {
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MIN_DBM - 0.5 })).toBe('WEAK_SIGNAL');
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MAX_DBM + 1 })).toBe('WEAK_SIGNAL');
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MIN_DBM })).toBe('HEALTHY');
  });

  it('treats an unknown optical reading as acceptable', () => {
    expect(diagnose({ ...healthy, opticalSignalDbm: undefined, routerOnline: false })).toBe('ROUTER_OFFLINE');
  });
});

describe('reset router flow', () => {
  it('reboots a healthy line remotely after confirmation, with an idempotency key per service', async () => {
    const chat = new ChatHarness();
    const check = await chat.say('please reset my router');
    expect(check.text).toContain('look healthy');
    expect(chat.awaiting).toBe('rebootConfirm');

    const reboot = jest.spyOn(chat.clients.network, 'requestRemoteReboot');
    const done = await chat.say('yes');
    expect(chat.clients.network.reboots).toEqual(['SVC-1']);
    expect(reboot.mock.calls[0][2]).toMatch(/:reboot-SVC-1$/);
    expect(outcomeOf(done, 'reset_router')).toBe('remote_reboot');
  });

  it('gives manual steps when the customer declines the remote restart', async () => {
    const chat = new ChatHarness();
    await chat.say('reboot the router');
    const declined = await chat.say('not now');
    expect(declined.text).toContain('1. Switch the router off at the wall');
    expect(chat.clients.network.reboots).toHaveLength(0);
    expect(outcomeOf(declined, 'reset_router')).toBe('manual_steps');
  });

  it('stops before rebooting when the ONT is offline and points to outage checks', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...healthy, ontOnline: false };
    const turn = await chat.say('reset the hub please');
    expect(turn.text).toContain("fibre box (the ONT on the wall) isn't responding");
    expect(turn.replies[0].quickReplies?.map((q) => q.payload)).toContain('intent:CHECK_OUTAGE');
    expect(chat.clients.network.reboots).toHaveLength(0);
    expect(outcomeOf(turn, 'reset_router')).toBe('ont_offline');
  });

  it('walks through manual checks for an offline router and escalates if they fail', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...healthy, routerOnline: false };
    const steps = await chat.say('router lights are red');
    expect(steps.text).toContain('Your router appears to be offline');
    expect(chat.awaiting).toBe('manualWorked');

    const escalated = await chat.say('no');
    expect(escalated.replies[0].quickReplies?.map((q) => q.payload)).toEqual(['intent:RAISE_TICKET', 'intent:TALK_TO_AGENT']);
    expect(outcomeOf(escalated, 'reset_router')).toBe('escalation_offered');
  });

  it('falls back to manual steps when the router rejects the reboot command', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'requestRemoteReboot').mockResolvedValue({ accepted: false });
    await chat.say('please reset my router');
    const rejected = await chat.say('yes');
    expect(rejected.text).toContain("didn't accept the restart command");
    expect(chat.awaiting).toBe('manualWorked');
  });

  it('asks which service to reset when the account has several, accepting the option number', async () => {
    const base = account().services[0];
    const chat = new ChatHarness();
    chat.clients.account.summary = account({
      services: [
        base,
        { ...base, serviceId: 'SVC-2', productName: 'Fibre 900', serviceAddress: { line1: '9 Dock Road', town: 'Hull', postcode: 'HU1 1AA' } },
        { ...base, serviceId: 'SVC-3', status: 'CEASED' },
      ],
    });
    const diagnostic = jest.spyOn(chat.clients.network, 'runLineDiagnostic');

    const prompt = await chat.say('please reset my router');
    expect(prompt.text).toContain('1. Fibre 500 at 1 High Street, SW1A 1AA');
    expect(prompt.text).toContain('2. Fibre 900 at 9 Dock Road, HU1 1AA');
    expect(prompt.text).not.toContain('3.');

    await chat.say('2');
    expect(diagnostic).toHaveBeenCalledWith('SVC-2', expect.anything());
  });
});

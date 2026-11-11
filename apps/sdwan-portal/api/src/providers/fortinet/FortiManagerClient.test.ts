import { silentLogger } from '../../logging/logger';
import { fakeFetch, FakeReply, noSleep } from '../../testing/fakeFetch';
import { FortiManagerClient } from './FortiManagerClient';

const ok = (data: unknown, url = '/x'): FakeReply => ({ body: { id: 1, result: [{ status: { code: 0, message: 'OK' }, url, data }] } });
const status = (code: number, message: string): FakeReply => ({ body: { id: 1, result: [{ status: { code, message }, url: '/x' }] } });
const login = (session: string): FakeReply => ({ body: { id: 1, session, result: [{ status: { code: 0, message: 'OK' }, url: '/sys/login/user' }] } });

function client(replies: FakeReply[]) {
  const fake = fakeFetch(replies);
  const fmg = new FortiManagerClient(
    { baseUrl: 'https://fmg.test', timeoutMs: 1000, maxRetries: 1, backoffBaseMs: 1, backoffMaxMs: 1, logger: silentLogger, fetchImpl: fake.fetch, sleepImpl: noSleep },
    { username: 'api', password: 'pw' },
  );
  return { fmg, calls: fake.calls };
}

describe('FortiManagerClient', () => {
  it('passes the session token in the JSON-RPC body and returns result data', async () => {
    const { fmg, calls } = client([login('s-1'), ok([{ name: 'fgt-leeds' }])]);
    await expect(fmg.rpc('get', '/dvmdb/adom/acme/device')).resolves.toEqual([{ name: 'fgt-leeds' }]);
    expect(calls[1].body).toMatchObject({ method: 'get', session: 's-1', params: [{ url: '/dvmdb/adom/acme/device' }] });
  });

  it('logs in again and replays the call on an invalid session code', async () => {
    const { fmg, calls } = client([login('s-1'), status(-11, 'No permission for the resource'), login('s-2'), ok({ done: true })]);
    await expect(fmg.rpc('get', '/task/task/1')).resolves.toEqual({ done: true });
    expect((calls[3].body as { session: string }).session).toBe('s-2');
  });

  it('turns a non-zero status into an upstream problem', async () => {
    const { fmg } = client([login('s-1'), status(-3, 'Object does not exist')]);
    await expect(fmg.rpc('get', '/pm/config/adom/acme/obj/firewall/address/x')).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Object does not exist'),
    });
  });

  it('distinguishes an unreachable device from a device that rejected the request', async () => {
    const unreachable = client([login('s'), ok([{ status: { code: -1, message: 'timeout' }, target: 'fgt' }])]);
    await expect(unreachable.fmg.proxy('acme', 'fgt', 'get', '/api/v2/monitor/system/status')).rejects.toMatchObject({
      extensions: expect.objectContaining({ retryable: true }),
    });

    const rejected = client([login('s'), ok([{ status: { code: 0, message: 'OK' }, target: 'fgt', response: { status: 'error', http_status: 424 } }])]);
    await expect(rejected.fmg.proxy('acme', 'fgt', 'put', '/api/v2/cmdb/firewall/policy/1', {})).rejects.toMatchObject({
      extensions: expect.objectContaining({ retryable: false, upstreamStatus: 424 }),
    });
  });

  it('reports task failures with per-device detail', async () => {
    const { fmg } = client([
      login('s'),
      ok({ percent: 40, num_err: 0, state: 1 }),
      ok({ percent: 100, num_err: 1, state: 4 }),
      ok([{ name: 'fgt-york', detail: 'install failed: policy conflict' }]),
    ]);
    await expect(fmg.waitForTask(9, { timeoutMs: 10_000, pollMs: 1, sleep: noSleep })).rejects.toThrow(/fgt-york: install failed/);
  });
});

import { requestContext, silentLogger } from '../../logging/logger';
import { fakeFetch, FakeReply, noSleep } from '../../testing/fakeFetch';
import { VcoRpcError, VeloCloudClient } from './VeloCloudClient';

const login: FakeReply = { body: {}, headers: { 'set-cookie': 'velocloud.session=abc123; Path=/; HttpOnly' } };

function client(replies: FakeReply[]) {
  const fake = fakeFetch(replies);
  const vco = new VeloCloudClient(
    { baseUrl: 'https://vco.test/', timeoutMs: 1000, maxRetries: 2, backoffBaseMs: 1, backoffMaxMs: 1, logger: silentLogger, fetchImpl: fake.fetch, sleepImpl: noSleep },
    { username: 'svc', password: 'secret', loginType: 'operator' },
  );
  return { vco, calls: fake.calls };
}

describe('VeloCloudClient', () => {
  it('logs in once, then sends the session cookie and correlation id on every call', async () => {
    const { vco, calls } = client([login, { body: [{ id: 1 }] }, { body: [{ id: 2 }] }]);
    await requestContext.run({ correlationId: 'corr-12345678' }, async () => {
      await vco.call('enterprise/getEnterpriseEdges', { enterpriseId: 7 });
      await vco.call('enterprise/getEnterpriseEdges', { enterpriseId: 7 });
    });
    expect(calls.map((c) => c.url)).toEqual([
      'https://vco.test/portal/rest/login/operatorLogin',
      'https://vco.test/portal/rest/enterprise/getEnterpriseEdges',
      'https://vco.test/portal/rest/enterprise/getEnterpriseEdges',
    ]);
    expect(calls[1].headers).toMatchObject({ Cookie: 'velocloud.session=abc123', 'X-Correlation-Id': 'corr-12345678' });
    expect(calls[0].body).toEqual({ username: 'svc', password: 'secret' });
  });

  it('re-authenticates once when VCO reports the session is no longer valid', async () => {
    const { vco, calls } = client([
      login,
      { body: { error: { code: -32000, message: 'session not valid' } } },
      login,
      { body: { ok: true } },
    ]);
    await expect(vco.call('edge/getEdge', { id: 1 })).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(4);
  });

  it('surfaces other RPC errors without retrying', async () => {
    const { vco } = client([login, { body: { error: { code: -32602, message: 'invalid params' } } }]);
    const err = await vco.call('edge/getEdge', {}).catch((e) => e);
    expect(err).toBeInstanceOf(VcoRpcError);
    expect(err).toMatchObject({ code: -32602, status: 502 });
  });

  it('retries idempotent reads on 503 but never retries a write', async () => {
    const read = client([login, { status: 503 }, { body: { ok: 1 } }]);
    await expect(read.vco.call('metrics/getEdgeLinkSeries', {})).resolves.toEqual({ ok: 1 });

    const write = client([login, { status: 503 }]);
    await expect(write.vco.call('configuration/updateConfigurationModule', {})).rejects.toMatchObject({ status: 502 });
    expect(write.calls).toHaveLength(2);
  });

  it('fails login loudly when no session cookie comes back', async () => {
    const { vco } = client([{ body: {} }]);
    await expect(vco.login()).rejects.toThrow(/no session cookie/);
    expect(vco.hasSession).toBe(false);
  });
});

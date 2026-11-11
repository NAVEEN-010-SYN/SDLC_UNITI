import { silentLogger } from '../logger';
import { AnalyticsEvent, BatchingAnalytics, hashUserId } from './analyticsEmitter';

function setup(batchSize = 3, transport = jest.fn<Promise<void>, [AnalyticsEvent[]]>(async () => undefined), maxBuffer?: number) {
  const analytics = new BatchingAnalytics({ transport, batchSize, flushIntervalMs: 0, logger: silentLogger, maxBuffer });
  return { analytics, transport };
}

describe('BatchingAnalytics', () => {
  it('hashes user ids deterministically and never sends the raw id', async () => {
    const { analytics, transport } = setup(1);
    analytics.track('message_received', 'c1', 'user-123');
    await analytics.flush();
    const sent = transport.mock.calls[0][0][0];
    expect(sent.userHash).toBe(hashUserId('user-123'));
    expect(JSON.stringify(sent)).not.toContain('user-123');
  });

  it('flushes automatically when the batch size is reached', async () => {
    const { analytics, transport } = setup(2);
    analytics.track('flow_started', 'c1', 'u');
    expect(transport).not.toHaveBeenCalled();
    analytics.track('flow_completed', 'c1', 'u');
    await analytics.flush();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].map((e) => e.name)).toEqual(['flow_started', 'flow_completed']);
  });

  it('redacts PII in event properties', async () => {
    const { analytics, transport } = setup(10);
    analytics.track('fallback', 'c1', 'u', { utterance: 'email me at a@b.com' });
    await analytics.flush();
    expect(transport.mock.calls[0][0][0].properties.utterance).toBe('email me at [EMAIL]');
  });

  it('requeues a failed batch for the next flush', async () => {
    const transport = jest
      .fn<Promise<void>, [AnalyticsEvent[]]>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(undefined);
    const { analytics } = setup(10, transport);
    analytics.track('fallback', 'c1', 'u');
    await analytics.flush();
    expect(analytics.pending).toBe(1);
    await analytics.flush();
    expect(analytics.pending).toBe(0);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest events beyond the buffer limit', async () => {
    const transport = jest.fn<Promise<void>, [AnalyticsEvent[]]>().mockRejectedValue(new Error('down'));
    const { analytics } = setup(100, transport, 3);
    for (let i = 0; i < 5; i += 1) analytics.track('message_received', `c${i}`, 'u');
    expect(analytics.pending).toBe(3);
    await analytics.close();
    expect(analytics.pending).toBe(3);
  });
});

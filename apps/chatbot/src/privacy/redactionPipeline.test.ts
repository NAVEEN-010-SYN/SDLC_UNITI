import { AnalyticsEvent, BatchingAnalytics } from '../analytics/analyticsEmitter';
import { silentLogger } from '../logger';
import { InMemoryTranscriptRepository } from '../transcripts/transcriptRepository';
import { findPii, redact, redactPayload, redactText } from './piiRedactor';

/**
 * Covers the remaining detectors and verifies that every sink that persists or
 * exports customer text (transcripts, analytics) applies redaction itself.
 */

describe('financial and credential detectors', () => {
  it('redacts IBANs as a single span even when the digits would also pass as a card', () => {
    const matches = findPii('refund to GB82 WEST 1234 5698 7654 32 please');
    expect(matches).toEqual([{ kind: 'IBAN', start: 10, end: 37 }]);
    expect(redactText('refund to GB82 WEST 1234 5698 7654 32 please')).toBe('refund to [IBAN] please');
  });

  it('redacts sort codes but leaves ordinary hyphenated dates alone', () => {
    expect(redactText('sort code 12-34-56')).toBe('sort code [SORT_CODE]');
    expect(redactText('installed on 2026-11-09')).toBe('installed on 2026-11-09');
  });

  it('redacts PINs and passcodes while keeping the disclosure wording', () => {
    expect(redactText('my pin: 4821')).toBe('my pin: [PASSWORD]');
    expect(redactText('Passcode = s3cr3t-value')).toBe('Passcode = [PASSWORD]');
  });

  it('redacts several kinds in one utterance, preserving surrounding text exactly', () => {
    const { text, matches } = redact('Hi, I am jo@example.com at M1 1AE, router 10.0.0.1, call +447700900123.');
    expect(text).toBe('Hi, I am [EMAIL] at [UK_POSTCODE], router [IP_ADDRESS], call [PHONE].');
    expect(matches.map((m) => m.kind)).toEqual(['EMAIL', 'UK_POSTCODE', 'IP_ADDRESS', 'PHONE']);
  });

  it('returns the original string untouched when there is nothing to redact', () => {
    const input = 'My 500 Mbps plan is slow tonight';
    expect(redact(input)).toEqual({ text: input, matches: [] });
  });

  it('does not mutate the payload it redacts', () => {
    const payload = { note: 'email a@b.co', nested: { list: ['x@y.com'] } };
    const copy = structuredClone(payload);
    redactPayload(payload);
    expect(payload).toEqual(copy);
  });

  it('passes through non-string scalars and nulls', () => {
    expect(redactPayload({ n: 1, b: false, z: null, u: undefined })).toEqual({ n: 1, b: false, z: null, u: undefined });
  });
});

describe('sinks redact on write', () => {
  it('stores only redacted transcript text, whoever the author is', async () => {
    const repo = new InMemoryTranscriptRepository(() => new Date('2026-11-09T10:00:00Z'), () => 'entry-1');
    const stored = await repo.append({ conversationId: 'c1', author: 'AGENT', text: 'I have emailed jane@example.com' });
    expect(stored.text).toBe('I have emailed [EMAIL]');
    const page = await repo.list('c1', 1, 10);
    expect(page.items[0].text).toBe('I have emailed [EMAIL]');
  });

  it('redacts analytics properties and hashes the user id before export', async () => {
    const batches: AnalyticsEvent[][] = [];
    const analytics = new BatchingAnalytics({
      transport: async (events) => {
        batches.push(events);
      },
      batchSize: 10,
      flushIntervalMs: 0,
      logger: silentLogger,
    });

    analytics.track('fallback', 'c1', 'user-42', { utterance: 'ring me on 07700 900123', outcome: '1' });
    await analytics.close();

    const [event] = batches[0];
    expect(event.properties.utterance).toBe('ring me on [PHONE]');
    expect(event.userHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(event)).not.toContain('user-42');
  });
});

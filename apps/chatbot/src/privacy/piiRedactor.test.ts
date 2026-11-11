import { findPii, passesLuhn, redact, redactPayload, redactText } from './piiRedactor';

describe('piiRedactor', () => {
  it('validates card numbers with the Luhn checksum', () => {
    expect(passesLuhn('4111 1111 1111 1111')).toBe(true);
    expect(passesLuhn('4111 1111 1111 1112')).toBe(false);
    expect(passesLuhn('1234')).toBe(false);
  });

  it('redacts emails, card numbers and phone numbers', () => {
    const result = redactText('Email me at jane.doe@example.com, card 4111-1111-1111-1111, call 07700 900123');
    expect(result).toBe('Email me at [EMAIL], card [CARD_NUMBER], call [PHONE]');
  });

  it('does not treat a non-Luhn digit run as a card number', () => {
    const matches = findPii('order 1234567890123456 placed');
    expect(matches.some((m) => m.kind === 'CARD_NUMBER')).toBe(false);
  });

  it('redacts UK postcodes case-insensitively', () => {
    expect(redactText('I live at sw1a 1aa near the park')).toBe('I live at [UK_POSTCODE] near the park');
  });

  it('leaves ordinary words that merely contain or follow a secret keyword untouched', () => {
    expect(redactText('my router is pinned to channel six')).toBe('my router is pinned to channel six');
    expect(redactText('I need a password reset')).toBe('I need a password reset');
    expect(redactText("my password isn't working")).toBe("my password isn't working");
  });

  it('redacts a bare PIN given straight after the keyword', () => {
    expect(redactText('my pin 4821 please')).toBe('my pin [PASSWORD] please');
  });

  it('redacts only the secret part of a password disclosure', () => {
    expect(redactText('my password is Hunter2!')).toBe('my password is [PASSWORD]');
  });

  it('validates IPv4 octets before redacting', () => {
    expect(redactText('router at 192.168.1.254')).toBe('router at [IP_ADDRESS]');
    expect(redactText('version 999.1.2.3')).toBe('version 999.1.2.3');
  });

  it('keeps kinds that the caller explicitly allows', () => {
    const result = redact('postcode SW1A 1AA email a@b.co', new Set(['UK_POSTCODE']));
    expect(result.text).toBe('postcode SW1A 1AA email [EMAIL]');
    expect(result.matches).toHaveLength(1);
  });

  it('resolves overlapping matches in favour of the earliest and longest', () => {
    const matches = findPii('+44 7700 900123');
    expect(matches).toHaveLength(1);
    expect(matches[0].kind).toBe('PHONE');
  });

  it('deep-redacts nested payloads', () => {
    const payload = { user: { note: 'contact x@y.com' }, tags: ['07700 900123', 'ok'], count: 3 };
    expect(redactPayload(payload)).toEqual({ user: { note: 'contact [EMAIL]' }, tags: ['[PHONE]', 'ok'], count: 3 });
  });
});

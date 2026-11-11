import { extractEntities, firstEntity, normaliseDate, normalisePostcode, normaliseSpeed } from './entityExtractor';

describe('entityExtractor', () => {
  it('extracts and normalises domain identifiers', () => {
    const entities = extractEntities('my account is acc12345678 and invoice INV-00123456');
    expect(firstEntity(entities, 'ACCOUNT_ID')).toBe('ACC-12345678');
    expect(firstEntity(entities, 'INVOICE_ID')).toBe('INV-00123456');
  });

  it('normalises speeds to Mbps', () => {
    expect(normaliseSpeed('1 Gbps')).toBe('1000');
    expect(normaliseSpeed('2gig')).toBe('2000');
    expect(normaliseSpeed('500 Mb')).toBe('500');
    expect(firstEntity(extractEntities('upgrade me to 2 gig please'), 'SPEED')).toBe('2000');
  });

  it('normalises postcodes to canonical spacing', () => {
    expect(normalisePostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(firstEntity(extractEntities('outage at m1 1ae?'), 'POSTCODE')).toBe('M1 1AE');
  });

  it('normalises several date formats', () => {
    const ref = new Date('2026-05-01T00:00:00Z');
    expect(normaliseDate('2026-03-12', ref)).toBe('2026-03-12');
    expect(normaliseDate('12/03/26', ref)).toBe('2026-03-12');
    expect(normaliseDate('3rd June', ref)).toBe('2026-06-03');
  });

  it('normalises UK phone numbers with international prefix', () => {
    expect(firstEntity(extractEntities('call +44 7700 900123'), 'PHONE')).toBe('07700900123');
  });

  it('returns entities ordered by position without overlaps', () => {
    const entities = extractEntities('TKT-1234567 at SW1A 1AA');
    expect(entities.map((e) => e.type)).toEqual(['TICKET_ID', 'POSTCODE']);
  });
});

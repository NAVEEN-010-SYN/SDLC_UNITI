import { extractEntities } from '../nlu/entityExtractor';
import { choiceSlot, freeTextSlot, invoiceIdSlot, phoneSlot, postcodeSlot, SlotValidator, speedSlot, yesNoSlot } from './slots';

const parse = (validator: SlotValidator, text: string) => validator.parse(text, extractEntities(text));

describe('slot validators', () => {
  it('parses postcodes from entities embedded in a sentence or bare input', () => {
    expect(parse(postcodeSlot, "it's at ec1a1bb thanks")).toEqual({ ok: true, value: 'EC1A 1BB' });
    expect(parse(postcodeSlot, 'w1a 0ax')).toEqual({ ok: true, value: 'W1A 0AX' });
    expect(parse(postcodeSlot, '12345')).toMatchObject({ ok: false });
  });

  it('normalises UK phone numbers and rejects non-UK formats', () => {
    expect(parse(phoneSlot, '+44 7700 900123')).toEqual({ ok: true, value: '07700900123' });
    expect(parse(phoneSlot, '020 7946 0018')).toEqual({ ok: true, value: '02079460018' });
    expect(parse(phoneSlot, '555-0100')).toMatchObject({ ok: false, error: expect.stringContaining('UK phone number') });
  });

  it('understands yes/no variants including quick-reply payloads and punctuation', () => {
    expect(parse(yesNoSlot, 'Yes please!')).toEqual({ ok: true, value: true });
    expect(parse(yesNoSlot, 'intent:AFFIRM')).toEqual({ ok: true, value: true });
    expect(parse(yesNoSlot, 'No thanks')).toEqual({ ok: true, value: false });
    expect(parse(yesNoSlot, 'maybe later')).toMatchObject({ ok: false });
  });

  it('collapses whitespace in free text and enforces length bounds', () => {
    const validator = freeTextSlot(5, 20);
    expect(parse(validator, '  line   keeps\n dropping ')).toEqual({ ok: true, value: 'line keeps dropping' });
    expect(parse(validator, 'hm')).toMatchObject({ ok: false, error: expect.stringContaining('at least 5') });
    expect(parse(validator, 'x'.repeat(21))).toMatchObject({ ok: false, error: expect.stringContaining('under 20') });
  });

  describe('choiceSlot', () => {
    const options = [
      { key: 'FIBRE-900', label: 'Fibre 900', aliases: ['900 mbps'] },
      { key: 'FIBRE-1000', label: 'Fibre Gigabit', aliases: ['1 gbps'] },
      { key: 'VOICE', label: 'Home Phone' },
    ];
    const validator = choiceSlot(() => options);

    it('accepts an in-range option number but not out-of-range or decimal numbers', () => {
      expect(parse(validator, '3')).toEqual({ ok: true, value: 'VOICE' });
      expect(parse(validator, '4')).toMatchObject({ ok: false });
      expect(parse(validator, '0')).toMatchObject({ ok: false });
    });

    it('accepts keys, labels and aliases case-insensitively', () => {
      expect(parse(validator, 'fibre-1000')).toEqual({ ok: true, value: 'FIBRE-1000' });
      expect(parse(validator, 'HOME PHONE')).toEqual({ ok: true, value: 'VOICE' });
      expect(parse(validator, '1 Gbps')).toEqual({ ok: true, value: 'FIBRE-1000' });
    });

    it('accepts an unambiguous partial label but rejects an ambiguous one', () => {
      expect(parse(validator, 'gigabit')).toEqual({ ok: true, value: 'FIBRE-1000' });
      const ambiguous = parse(validator, 'fibre');
      expect(ambiguous).toMatchObject({ ok: false, error: 'Please pick one of: 1. Fibre 900, 2. Fibre Gigabit, 3. Home Phone.' });
    });

    it('re-reads options on every parse so dynamic lists stay current', () => {
      const dynamic: Array<{ key: string; label: string }> = [];
      const lazy = choiceSlot(() => dynamic);
      expect(parse(lazy, '1')).toMatchObject({ ok: false });
      dynamic.push({ key: 'A', label: 'Alpha' });
      expect(parse(lazy, '1')).toEqual({ ok: true, value: 'A' });
    });
  });

  it('restricts speeds to the advertised tiers', () => {
    const validator = speedSlot([500, 1000, 2000]);
    expect(parse(validator, '2 gig please')).toEqual({ ok: true, value: 2000 });
    expect(parse(validator, '500')).toEqual({ ok: true, value: 500 });
    expect(parse(validator, '300 mbps')).toMatchObject({ ok: false, error: 'We offer 500 Mbps, 1 Gbps, 2 Gbps. Which would you like?' });
  });

  it('resolves invoice references to an id or the LATEST marker', () => {
    expect(parse(invoiceIdSlot, 'inv00123456 please')).toEqual({ ok: true, value: 'INV-00123456' });
    expect(parse(invoiceIdSlot, 'the latest one')).toMatchObject({ ok: false });
    expect(parse(invoiceIdSlot, 'latest one')).toEqual({ ok: true, value: 'LATEST' });
    expect(parse(invoiceIdSlot, 'most recent')).toEqual({ ok: true, value: 'LATEST' });
  });
});

import { groupByRow, precheckCsv } from './csv-precheck';
import { stageReached } from './order-detail.page';

const HEADER = 'partner_reference,order_type,uprn,product_code,care_level,requested_date';

describe('precheckCsv', () => {
  it('accepts a well-formed file', () => {
    expect(precheckCsv('orders.csv', 200, `${HEADER}\nR1,PROVIDE,123,FTTP500,,2030-01-01\n`)).toEqual([]);
  });

  it('tolerates a BOM, CRLF and header spacing', () => {
    const text = '﻿Partner Reference,Order_Type,UPRN,Requested Date\r\nR1,CEASE,1,2030-01-01\r\n';
    expect(precheckCsv('orders.CSV', 100, text)).toEqual([]);
  });

  it('reports wrong file type, unknown and missing columns', () => {
    const errors = precheckCsv('orders.xlsx', 100, 'partner_reference,order_type,uprn,requsted_date\nR1,PROVIDE,1,2030-01-01');
    expect(errors.map((e) => e.code)).toEqual(['file_type', 'unknown_column', 'missing_column']);
  });

  it('rejects empty, header-only and oversized files', () => {
    expect(precheckCsv('a.csv', 0, '').map((e) => e.code)).toEqual(['empty']);
    expect(precheckCsv('a.csv', 10, HEADER).map((e) => e.code)).toEqual(['no_rows']);
    const rows = Array.from({ length: 2001 }, (_, i) => `R${i},PROVIDE,${i + 1},FTTP500,,2030-01-01`).join('\n');
    expect(precheckCsv('a.csv', 2_000_000, `${HEADER}\n${rows}`).map((e) => e.code)).toEqual(['too_large', 'too_many_rows']);
  });
});

describe('groupByRow', () => {
  it('groups by line in order with file-level errors first', () => {
    const grouped = groupByRow([
      { row: 3, column: 'uprn', code: 'format', message: 'bad' },
      { row: 0, column: '*', code: 'too_large', message: 'big' },
      { row: 3, column: 'order_type', code: 'unknown', message: 'type' },
    ]);
    expect(grouped.map((g) => g.row)).toEqual([0, 3]);
    expect(grouped[1].errors.map((e) => e.column)).toEqual(['order_type', 'uprn']);
  });
});

describe('stageReached', () => {
  const at = '2024-01-01T00:00:00.000Z';

  it('tracks the furthest lifecycle stage', () => {
    expect(stageReached({ status: 'PROVISIONING', history: [] })).toBe(2);
  });

  it('keeps progress made before a cancellation', () => {
    const history = [
      { from: null, to: 'DRAFT', at, note: '', actor: null },
      { from: 'DRAFT', to: 'SUBMITTED', at, note: '', actor: null },
      { from: 'SUBMITTED', to: 'VALIDATED', at, note: '', actor: null },
      { from: 'VALIDATED', to: 'CANCELLED', at, note: '', actor: null },
    ];
    expect(stageReached({ status: 'CANCELLED', history })).toBe(1);
  });

  it('is -1 for drafts', () => {
    expect(stageReached({ status: 'DRAFT', history: [] })).toBe(-1);
  });
});

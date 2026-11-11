import { BulkRowError } from '../core/api.models';

export const REQUIRED_COLUMNS = ['partner_reference', 'order_type', 'uprn', 'requested_date'];
export const OPTIONAL_COLUMNS = ['product_code', 'care_level', 'existing_service_id', 'migration_auth_code'];
export const MAX_ROWS = 2000;
export const MAX_BYTES = 1_048_576;

/**
 * Cheap client-side checks run before upload so obvious mistakes (wrong file, renamed header,
 * too many rows) are caught instantly. The server remains the authority on row validation.
 */
export function precheckCsv(fileName: string, sizeBytes: number, text: string): BulkRowError[] {
  const errors: BulkRowError[] = [];
  if (!fileName.toLowerCase().endsWith('.csv')) {
    errors.push(fileError('file_type', 'Only .csv files are accepted.'));
  }
  if (sizeBytes > MAX_BYTES) {
    errors.push(fileError('too_large', `The file exceeds the ${MAX_BYTES / 1024} KB limit.`));
  }

  const withoutBom = text.replace(/^\uFEFF/, '');
  const lines = withoutBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    errors.push(fileError('empty', 'The file is empty.'));
    return errors;
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/ /g, '_'));
  const known = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  for (const h of header) {
    if (!known.has(h)) {
      errors.push({ row: 1, column: h, code: 'unknown_column', message: `Unknown column '${h}'.` });
    }
  }
  for (const c of REQUIRED_COLUMNS) {
    if (!header.includes(c)) {
      errors.push({ row: 1, column: c, code: 'missing_column', message: `Required column '${c}' is missing.` });
    }
  }

  const dataRows = lines.length - 1;
  if (dataRows === 0) {
    errors.push(fileError('no_rows', 'The file has a header but no order rows.'));
  } else if (dataRows > MAX_ROWS) {
    errors.push(fileError('too_many_rows', `A bulk upload may contain at most ${MAX_ROWS} rows; split the file.`));
  }
  return errors;
}

/** Groups row errors by line for display, file-level errors (row 0/1 with column "*") first. */
export function groupByRow(errors: BulkRowError[]): { row: number; errors: BulkRowError[] }[] {
  const sorted = [...errors].sort((a, b) => a.row - b.row || a.column.localeCompare(b.column));
  const byRow = new Map<number, BulkRowError[]>();
  for (const e of sorted) {
    const rowErrors = byRow.get(e.row);
    if (rowErrors) {
      rowErrors.push(e);
    } else {
      byRow.set(e.row, [e]);
    }
  }

  const groups: { row: number; errors: BulkRowError[] }[] = [];
  for (const [row, rowErrors] of byRow) {
    groups.push({ row, errors: rowErrors });
  }
  return groups;
}

function fileError(code: string, message: string): BulkRowError {
  return { row: 0, column: '*', code, message };
}

import { addressSchema, trimAddress, validateValues } from './validation';

/**
 * Parses a pasted site list for Business GoKinetic multi-site quotes.
 *
 * Accepts CSV or tab-separated rows (as copied from a spreadsheet) with the
 * columns: street, unit (optional), city, state, ZIP. A header row is
 * detected and skipped. Duplicate sites are dropped so the volume tier is
 * not inflated by accident.
 *
 * @returns {{ sites: object[], problems: Array<{line: number, message: string}> }}
 */
export function parseSiteList(text, { maxSites = 200 } = {}) {
  const sites = [];
  const problems = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trim();
    if (!line) return;
    const cells = splitRow(line);
    if (index === 0 && /street|address/i.test(cells[0] || '')) return;

    let address;
    if (cells.length === 5) {
      address = { line1: cells[0], line2: cells[1], city: cells[2], state: cells[3], postalCode: cells[4] };
    } else if (cells.length === 4) {
      address = { line1: cells[0], line2: '', city: cells[1], state: cells[2], postalCode: cells[3] };
    } else {
      problems.push({ line: lineNo, message: 'Expected street, [unit], city, state, ZIP.' });
      return;
    }

    const errors = validateValues(addressSchema(''), address);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      problems.push({ line: lineNo, message: firstError });
      return;
    }
    const clean = trimAddress(address);
    const key = [clean.line1, clean.line2 || '', clean.city, clean.state, clean.postalCode.slice(0, 5)].join('|').toUpperCase();
    if (seen.has(key)) {
      problems.push({ line: lineNo, message: 'Duplicate site skipped.' });
      return;
    }
    seen.add(key);
    sites.push(clean);
  });

  if (sites.length > maxSites) {
    problems.push({ line: 0, message: `A quote can include at most ${maxSites} sites; split the rest into another quote.` });
    sites.length = maxSites;
  }
  return { sites, problems };
}

/** Splits one CSV/TSV row, honouring double-quoted cells containing commas. */
function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Mirrors the server's Business GoKinetic volume tiers for the live estimate. */
const VOLUME_TIERS = [
  { minSites: 25, discountBps: 1500 },
  { minSites: 10, discountBps: 1000 },
  { minSites: 5, discountBps: 500 },
];

export function volumeTier(siteCount) {
  const tier = VOLUME_TIERS.find((t) => siteCount >= t.minSites);
  const next = [...VOLUME_TIERS].reverse().find((t) => siteCount < t.minSites);
  return {
    discountPercent: tier ? tier.discountBps / 100 : 0,
    nextTier: next ? { sitesNeeded: next.minSites - siteCount, discountPercent: next.discountBps / 100 } : null,
  };
}

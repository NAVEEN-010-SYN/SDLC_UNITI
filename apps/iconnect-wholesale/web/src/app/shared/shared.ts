import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { ApiProblem } from '../core/api-problem';

/** Formats integer minor units with their ISO currency, e.g. 2499 GBP -> "(pound)24.99". Never goes through floating maths for totals. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(minor: number | null | undefined, currency = 'GBP'): string {
    if (minor === null || minor === undefined) {
      return '\u2014';
    }
    const sign = minor < 0 ? '-' : '';
    const abs = Math.abs(minor);
    const major = Math.trunc(abs / 100).toLocaleString('en-GB');
    const pence = String(abs % 100).padStart(2, '0');
    const symbols: Record<string, string> = { GBP: '\u00A3', EUR: '\u20AC', USD: '$' };
    const symbol = symbols[currency];
    return symbol ? `${sign}${symbol}${major}.${pence}` : `${sign}${major}.${pence} ${currency}`;
  }
}

/** "PENDING_CUSTOMER" / "AtRisk" -> "Pending customer" / "At risk". */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const words = value.includes('_') ? value.split('_') : value.split(/(?=[A-Z])/);
    const sentence = words.map((w) => w.toLowerCase()).join(' ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
}

@Component({
  selector: 'icw-problem',
  standalone: true,
  template: `
    @if (problem) {
      <div class="card problem" role="alert">
        <strong>{{ problem.title }}</strong>
        @if (problem.detail) { <p>{{ problem.detail }}</p> }
        @if (fieldMessages.length) {
          <ul>@for (m of fieldMessages; track m) { <li>{{ m }}</li> }</ul>
        }
        @if (problem.correlationId) { <p class="muted">Reference for support: {{ problem.correlationId }}</p> }
      </div>
    }
  `,
  styles: ['.problem { border-color: var(--icw-danger); background: #fff6f5; } ul { margin: 0.5rem 0 0; }'],
})
export class ProblemComponent {
  @Input() problem: ApiProblem | null = null;

  get fieldMessages(): string[] {
    const result: string[] = [];
    const errors = this.problem?.fieldErrors ?? {};
    for (const [field, msgs] of Object.entries(errors)) {
      for (const m of msgs) {
        result.push(`${field}: ${m}`);
      }
    }
    return result;
  }
}

@Component({
  selector: 'icw-paginator',
  standalone: true,
  template: `
    <div class="row pager">
      <button class="secondary" [disabled]="page <= 1" (click)="pageChange.emit(page - 1)">Previous</button>
      <span class="muted">Page {{ page }} of {{ pages }} &middot; {{ total }} items</span>
      <button class="secondary" [disabled]="page >= pages" (click)="pageChange.emit(page + 1)">Next</button>
    </div>
  `,
  styles: ['.pager { margin-top: 0.75rem; align-items: center; }'],
})
export class PaginatorComponent {
  @Input({ required: true }) page = 1;
  @Input({ required: true }) pageSize = 25;
  @Input({ required: true }) total = 0;
  @Output() readonly pageChange = new EventEmitter<number>();

  get pages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
}

/** Converts a decimal major-unit string typed by a user ("12.5") into minor units without float rounding. */
export function parseMajorToMinor(input: string): number | null {
  const match = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** Today's date in UTC as YYYY-MM-DD, offset by whole days. */
export function isoDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return d.toISOString().slice(0, 10);
}

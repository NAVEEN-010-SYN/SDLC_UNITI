import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ApiProblem } from '../core/http/api-problem';

/** Renders an API problem with the correlation id customers quote to support. */
@Component({
  selector: 'gkb-problem-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problem(); as p) {
      <div class="alert alert--danger" role="alert">
        <strong>{{ p.title }}</strong>
        @if (p.detail && p.detail !== p.title) { <p>{{ p.detail }}</p> }
        @if (rowErrors().length) {
          <ul>
            @for (e of rowErrors(); track $index) { <li>{{ e }}</li> }
          </ul>
        }
        @if (p.correlationId) { <small>Reference: <code>{{ p.correlationId }}</code></small> }
      </div>
    }
  `
})
export class ProblemAlertComponent {
  readonly problem = input<ApiProblem | null>(null);
  /** Extra messages, e.g. field errors that matched no form control or per-row bulk errors. */
  readonly extra = input<string[]>([]);

  readonly rowErrors = computed(() => {
    const p = this.problem();
    const nested = p?.extensions['rowErrors'];
    const fromRules = Array.isArray(nested)
      ? nested.map((e: { row?: number; field?: string; message?: string }) => (e.row ? `Row ${e.row}: ` : '') + `${e.message ?? ''}`)
      : [];
    return [...fromRules, ...this.extra()];
  });
}

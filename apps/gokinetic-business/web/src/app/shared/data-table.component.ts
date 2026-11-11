import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  output
} from '@angular/core';

export interface Column<T> {
  key: string;
  header: string;
  /** Plain-text cell value; ignored when an `appCell` template exists for the key. */
  value?: (row: T) => string | number | null;
  align?: 'start' | 'end';
}

/** Custom cell template: `<ng-template gkbCell="status" let-row>...</ng-template>` */
@Directive({ selector: 'ng-template[gkbCell]', standalone: true })
export class CellDirective {
  readonly key = input.required<string>({ alias: 'gkbCell' });
  readonly template = inject(TemplateRef);
}

export interface PageEvent {
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [10, 20, 50, 100];

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "21–40 of 132" for the current page window. */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 results';
  const start = (page - 1) * pageSize + 1;
  return `${start}–${Math.min(page * pageSize, total)} of ${total}`;
}

@Component({
  selector: 'gkb-data-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrap" [attr.aria-busy]="loading()">
      <table class="table">
        <caption class="sr-only">{{ caption() }}</caption>
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th scope="col" [class.num]="col.align === 'end'">{{ col.header }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track trackBy()(row)) {
            <tr [class.clickable]="rowClickable()" (click)="rowClickable() && rowClick.emit(row)"
                (keydown.enter)="rowClickable() && rowClick.emit(row)" [attr.tabindex]="rowClickable() ? 0 : null">
              @for (col of columns(); track col.key) {
                <td [class.num]="col.align === 'end'">
                  @if (templates()[col.key]; as tpl) {
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                  } @else {
                    {{ col.value ? col.value(row) ?? '—' : '' }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr><td class="empty" [attr.colspan]="columns().length">{{ loading() ? 'Loading…' : emptyText() }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    @if (total() > 0) {
      <nav class="pager" aria-label="Pagination">
        <span>{{ range() }}</span>
        <label>Rows
          <select [value]="pageSize()" (change)="changeSize($any($event.target).value)">
            @for (size of pageSizes; track size) { <option [value]="size">{{ size }}</option> }
          </select>
        </label>
        <button type="button" (click)="go(page() - 1)" [disabled]="page() <= 1">Previous</button>
        <span>Page {{ page() }} of {{ pages() }}</span>
        <button type="button" (click)="go(page() + 1)" [disabled]="page() >= pages()">Next</button>
      </nav>
    }
  `
})
export class DataTableComponent<T> {
  readonly columns = input.required<Column<T>[]>();
  readonly rows = input.required<T[]>();
  readonly total = input(0);
  readonly page = input(1);
  readonly pageSize = input(20);
  readonly loading = input(false);
  readonly caption = input('Results');
  readonly emptyText = input('Nothing to show yet.');
  readonly rowClickable = input(false);
  readonly trackBy = input<(row: T) => unknown>((row: T) => (row as { id?: unknown }).id ?? row);

  readonly pageChange = output<PageEvent>();
  readonly rowClick = output<T>();

  private readonly cells = contentChildren(CellDirective);
  readonly templates = computed(() => Object.fromEntries(this.cells().map((c) => [c.key(), c.template])) as Record<string, TemplateRef<unknown>>);
  readonly pages = computed(() => pageCount(this.total(), this.pageSize()));
  readonly range = computed(() => rangeLabel(this.page(), this.pageSize(), this.total()));
  readonly pageSizes = PAGE_SIZES;

  go(page: number): void {
    if (page < 1 || page > this.pages() || page === this.page()) return;
    this.pageChange.emit({ page, pageSize: this.pageSize() });
  }

  changeSize(value: string): void {
    // Reset to the first page so the user never lands beyond the new last page.
    this.pageChange.emit({ page: 1, pageSize: Number(value) });
  }
}

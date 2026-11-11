import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of } from 'rxjs';
import { ApiProblem } from '../core/http/api-problem';
import { Page, PageRequest } from '../core/models/api.models';
import { CellDirective, Column, DataTableComponent, PageEvent, pageCount, rangeLabel } from './data-table.component';
import { pagedQuery } from './paged-query';
import { StatusBadgeComponent } from './status-badge.component';

interface Row {
  id: string;
  name: string;
  status: string;
}

@Component({
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent],
  template: `
    <gkb-data-table [columns]="columns" [rows]="rows()" [total]="total()" [page]="page()" [pageSize]="10"
      [rowClickable]="true" (rowClick)="clicked = $event" (pageChange)="pageEvent = $event">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
    </gkb-data-table>
  `
})
class HostComponent {
  columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'status', header: 'Status' }
  ];
  rows = signal<Row[]>([
    { id: '1', name: 'London HQ', status: 'ACTIVE' },
    { id: '2', name: 'Leeds', status: 'PENDING' }
  ]);
  total = signal(25);
  page = signal(1);
  clicked: Row | null = null;
  pageEvent: PageEvent | null = null;
}

describe('data table helpers', () => {
  it('computes page counts and range labels', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
    expect(rangeLabel(2, 20, 41)).toBe('21–40 of 41');
    expect(rangeLabel(3, 20, 41)).toBe('41–41 of 41');
    expect(rangeLabel(1, 20, 0)).toBe('0 results');
  });
});

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders text cells and custom cell templates', () => {
    const cells = fixture.debugElement.queryAll(By.css('tbody td'));
    expect(cells[0].nativeElement.textContent.trim()).toBe('London HQ');
    expect(cells[1].query(By.css('.badge--success'))).not.toBeNull();
  });

  it('emits row clicks', () => {
    fixture.debugElement.queryAll(By.css('tbody tr'))[1].nativeElement.click();
    expect(host.clicked?.id).toBe('2');
  });

  it('pages forward and disables previous on the first page', () => {
    const [prev, next] = fixture.debugElement.queryAll(By.css('.pager button')).map((b) => b.nativeElement as HTMLButtonElement);
    expect(prev.disabled).toBeTrue();
    next.click();
    expect(host.pageEvent).toEqual({ page: 2, pageSize: 10 });
  });

  it('resets to page one when the page size changes', () => {
    host.page.set(3);
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.css('.pager select')).nativeElement as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(host.pageEvent).toEqual({ page: 1, pageSize: 50 });
  });

  it('shows the empty state', () => {
    host.rows.set([]);
    host.total.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain('Nothing to show');
    expect(fixture.nativeElement.querySelector('.pager')).toBeNull();
  });
});

describe('pagedQuery', () => {
  type Filter = { search?: string; status?: string };
  const page = (items: string[], total = items.length): Page<string> => ({ items, page: 1, pageSize: 20, total });

  function create(fetch: (f: Filter, p: PageRequest) => Observable<Page<string>>) {
    return TestBed.runInInjectionContext(() => pagedQuery<Filter, string>(fetch, { status: 'ACTIVE' }));
  }

  it('loads immediately with the initial filter', () => {
    const fetch = jasmine.createSpy('fetch').and.returnValue(of(page(['a', 'b'], 7)));
    const q = create(fetch);
    expect(fetch).toHaveBeenCalledWith({ status: 'ACTIVE' }, { page: 1, pageSize: 20 });
    expect(q.items()).toEqual(['a', 'b']);
    expect(q.total()).toBe(7);
    expect(q.loading()).toBeFalse();
  });

  it('merges filter patches and resets to page 1', () => {
    const fetch = jasmine.createSpy('fetch').and.returnValue(of(page([])));
    const q = create(fetch);
    q.setPage(3);
    q.setFilter({ search: 'leeds' });
    expect(fetch.calls.mostRecent().args).toEqual([{ status: 'ACTIVE', search: 'leeds' }, { page: 1, pageSize: 20 }]);
    expect(q.page()).toBe(1);
  });

  it('ignores responses to superseded requests', fakeAsync(() => {
    const first = new Subject<Page<string>>();
    const second = new Subject<Page<string>>();
    const responses = [first, second];
    const q = create(() => responses.shift()!);
    q.setFilter({ search: 'new' });
    second.next(page(['fresh']));
    first.next(page(['stale']));
    tick();
    expect(q.items()).toEqual(['fresh']);
  }));

  it('exposes API problems and keeps the previous rows', () => {
    let fail = false;
    const q = create(() => (fail ? new Observable<Page<string>>((s) => s.error(new ApiProblem(500, 'Boom', '', 'internal'))) : of(page(['kept']))));
    fail = true;
    q.reload();
    expect(q.error()?.title).toBe('Boom');
    expect(q.items()).toEqual(['kept']);
    expect(q.loading()).toBeFalse();
  });
});

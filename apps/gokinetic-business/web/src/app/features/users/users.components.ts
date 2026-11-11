import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, map, of } from 'rxjs';
import { InventoryApi, UserFilter, UsersApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { BusinessRole, BusinessUser, UserAction, UserStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { errorMessage } from '../../shared/validators';

const STATUSES: UserStatus[] = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];

/** Lifecycle actions offered for a user; the current admin cannot act on themselves. */
export function userActions(user: BusinessUser, currentUserId: string): UserAction[] {
  if (user.id === currentUserId) return [];
  switch (user.status) {
    case 'ACTIVE':
      return ['suspend', 'deactivate'];
    case 'SUSPENDED':
      return ['reactivate', 'deactivate'];
    case 'INVITED':
      return ['deactivate'];
    case 'DEACTIVATED':
      return [];
  }
}

@Component({
  selector: 'gkb-users',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, DatePipe, ProblemAlertComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Portal users</h1>
      <button type="button" class="primary" (click)="inviting.set(!inviting())">Invite user</button>
    </header>
    <gkb-problem-alert [problem]="problem() ?? users.error()" [extra]="unmatched()" />

    @if (inviting()) {
      <form class="card" [formGroup]="invite" (ngSubmit)="sendInvite()" novalidate>
        <h2>Invite a colleague</h2>
        <label>Email <input type="email" formControlName="email" autocomplete="off" /></label>
        @if (err('email'); as e) { <p class="field-error">{{ e }}</p> }
        <label>First name <input formControlName="firstName" /></label>
        @if (err('firstName'); as e) { <p class="field-error">{{ e }}</p> }
        <label>Last name <input formControlName="lastName" /></label>
        @if (err('lastName'); as e) { <p class="field-error">{{ e }}</p> }
        <fieldset>
          <legend>Role</legend>
          <label class="radio"><input type="radio" formControlName="role" value="BUSINESS_USER" /> User – view services, place orders, raise tickets</label>
          <label class="radio"><input type="radio" formControlName="role" value="BUSINESS_ADMIN" /> Admin – also manage users, billing and approvals</label>
        </fieldset>
        @if (invite.controls.role.value === 'BUSINESS_USER') {
          <fieldset>
            <legend>Site access</legend>
            <label class="checkbox"><input type="checkbox" formControlName="allSites" /> All sites</label>
            @if (!invite.controls.allSites.value) {
              @for (s of sites(); track s.id) {
                <label class="checkbox"><input type="checkbox" [checked]="scope().has(s.id)" (change)="toggleSite(s.id)" /> {{ s.code }} – {{ s.name }}</label>
              }
              @if (scopeError()) { <p class="field-error">Choose at least one site.</p> }
            }
          </fieldset>
        }
        <button type="submit" class="primary" [disabled]="busy()">Send invitation</button>
      </form>
    }

    <form class="filters">
      <label>Search <input type="search" (change)="users.setFilter({ search: $any($event.target).value.trim() || undefined })" /></label>
      <label>Status
        <select (change)="users.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
    </form>

    <gkb-data-table caption="Users" [columns]="columns" [rows]="users.items()" [total]="users.total()" [page]="users.page()"
      [pageSize]="users.pageSize()" [loading]="users.loading()" (pageChange)="users.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="lastLogin" let-row>{{ row.lastLoginAt ? (row.lastLoginAt | date: 'd MMM y') : 'Never' }}</ng-template>
      <ng-template gkbCell="actions" let-row>
        @if (row.id !== me()) {
          @if (row.status !== 'DEACTIVATED') {
            <button type="button" class="link" (click)="toggleRole(row)" [disabled]="busy()">
              Make {{ row.role === 'BUSINESS_ADMIN' ? 'user' : 'admin' }}
            </button>
          }
          @for (a of actionsFor(row); track a) {
            <button type="button" class="link" [class.danger]="a === 'deactivate'" (click)="transition(row, a)" [disabled]="busy()">{{ a }}</button>
          }
          @if (row.status === 'INVITED') { <button type="button" class="link" (click)="resend(row)" [disabled]="busy()">Resend invite</button> }
        }
      </ng-template>
    </gkb-data-table>
  `
})
export class UsersComponent {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = STATUSES;
  readonly me = computed(() => this.auth.session()?.userId ?? '');
  readonly inviting = signal(false);
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly scope = signal(new Set<string>());
  readonly scopeError = signal(false);

  readonly users = pagedQuery<UserFilter, BusinessUser>((f, p) => this.api.list(f, p), {});
  readonly sites = toSignal(
    inject(InventoryApi).sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items), catchError(() => of([]))),
    { initialValue: [] }
  );
  readonly columns: Column<BusinessUser>[] = [
    { key: 'name', header: 'Name', value: (u) => `${u.firstName} ${u.lastName}` },
    { key: 'email', header: 'Email', value: (u) => u.email },
    { key: 'role', header: 'Role', value: (u) => (u.role === 'BUSINESS_ADMIN' ? 'Admin' : 'User') },
    { key: 'scope', header: 'Sites', value: (u) => (u.siteScope ? `${u.siteScope.length} site(s)` : 'All') },
    { key: 'status', header: 'Status' },
    { key: 'lastLogin', header: 'Last sign-in' },
    { key: 'actions', header: '' }
  ];

  readonly invite = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    lastName: ['', [Validators.required, Validators.maxLength(60)]],
    role: this.fb.nonNullable.control<BusinessRole>('BUSINESS_USER'),
    allSites: [true]
  });

  actionsFor(user: BusinessUser): UserAction[] {
    return userActions(user, this.me());
  }

  err(name: 'email' | 'firstName' | 'lastName'): string | null {
    const c = this.invite.controls[name];
    return c.touched ? errorMessage(c.errors) : null;
  }

  toggleSite(id: string): void {
    this.scope.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  sendInvite(): void {
    revealErrors(this.invite);
    const v = this.invite.getRawValue();
    const restricted = v.role === 'BUSINESS_USER' && !v.allSites;
    this.scopeError.set(restricted && this.scope().size === 0);
    if (this.invite.invalid || this.scopeError()) return;
    this.run(
      this.api.invite({
        email: v.email.trim().toLowerCase(),
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        role: v.role,
        siteScope: restricted ? [...this.scope()] : null
      }),
      () => {
        this.invite.reset();
        this.scope.set(new Set());
        this.inviting.set(false);
      }
    );
  }

  toggleRole(user: BusinessUser): void {
    const role: BusinessRole = user.role === 'BUSINESS_ADMIN' ? 'BUSINESS_USER' : 'BUSINESS_ADMIN';
    // Admins see every site; a demoted admin keeps all-site access until restricted explicitly.
    this.run(this.api.changeRole(user, role, null));
  }

  transition(user: BusinessUser, action: UserAction): void {
    if (action === 'deactivate' && !confirm(`Deactivate ${user.email}? They will lose access immediately.`)) return;
    this.run(this.api.transition(user, action));
  }

  resend(user: BusinessUser): void {
    this.run(this.api.resendInvitation(user.id));
  }

  private run(call: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    this.unmatched.set([]);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.users.reload();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        this.unmatched.set(applyProblemToForm(this.invite, p));
        if (p.isConflict) this.users.reload();
      }
    });
  }
}

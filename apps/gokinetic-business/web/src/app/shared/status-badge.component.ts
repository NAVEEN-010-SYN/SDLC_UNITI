import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** One vocabulary of tones across orders, services, invoices, tickets, users and SLA states. */
const TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  PAID: 'success',
  MET: 'success',
  ON_TRACK: 'success',
  RESOLVED: 'success',
  VALIDATED: 'info',
  SUBMITTED: 'info',
  PROVISIONING: 'info',
  IN_PROGRESS: 'info',
  OPEN: 'info',
  ISSUED: 'info',
  INVITED: 'info',
  PENDING: 'warning',
  PENDING_CUSTOMER: 'warning',
  AT_RISK: 'warning',
  PAUSED: 'warning',
  SUSPENDED: 'warning',
  DISPUTED: 'warning',
  DRAFT: 'neutral',
  CLOSED: 'neutral',
  CEASED: 'neutral',
  VOID: 'neutral',
  DECOMMISSIONED: 'neutral',
  DEACTIVATED: 'neutral',
  CANCELLED: 'neutral',
  FAILED: 'danger',
  OVERDUE: 'danger',
  BREACHED: 'danger',
  P1: 'danger',
  P2: 'warning',
  P3: 'info',
  P4: 'neutral'
};

export function toneFor(status: string): BadgeTone {
  return TONES[status] ?? 'neutral';
}

export function humanise(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Component({
  selector: 'gkb-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge--' + tone()" [attr.title]="status()">{{ label() }}</span>`
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly tone = computed(() => toneFor(this.status()));
  readonly label = computed(() => (/^P[1-4]$/.test(this.status()) ? this.status() : humanise(this.status())));
}

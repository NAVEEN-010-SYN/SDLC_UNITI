import { expect, Locator, Page } from '@playwright/test';
import { ChangeRequestDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * SD-WAN change requests. Changes against VeloCloud or Fortinet edges are never
 * applied directly from the portal: they are captured, approved by a
 * BUSINESS_ADMIN, and scheduled into a maintenance window.
 */
export class SdwanChangeRequestPage extends BasePage {
  protected readonly path = '/change-requests';

  readonly newRequest: Locator;
  readonly requestsTable: Locator;

  constructor(page: Page) {
    super(page);
    this.newRequest = page.getByRole('button', { name: 'New change request' });
    this.requestsTable = page.getByRole('table', { name: 'Change requests' });
  }

  row(changeRequestId: string): Locator {
    return this.tableRows(this.requestsTable).filter({ hasText: changeRequestId });
  }

  private get form(): Locator {
    return this.page.getByRole('form', { name: 'Change request' });
  }

  async startRequest(draft: ChangeRequestDraft): Promise<void> {
    await this.newRequest.click();
    await this.form.getByLabel('Site').selectOption({ label: draft.siteName });
    await this.form.getByRole('radiogroup', { name: 'Change type' }).getByRole('radio', { name: typeLabel(draft.type) }).check();
    if (draft.type === 'BANDWIDTH' && draft.newBandwidthMbps !== undefined) {
      await this.form.getByLabel('New committed bandwidth (Mbps)').fill(String(draft.newBandwidthMbps));
    }
    await this.form.getByLabel('Business justification').fill(draft.justification);
    await this.form.getByLabel('Maintenance window start (UTC)').fill(toDateTimeLocal(draft.scheduledFor));
  }

  async currentBandwidthMbps(): Promise<number> {
    const text = await this.form.getByTestId('current-bandwidth').textContent();
    return Number((text ?? '').replace(/[^0-9]/g, ''));
  }

  async expectImpactPreview(pattern: RegExp): Promise<void> {
    await this.form.getByRole('button', { name: 'Preview impact' }).click();
    await expect(this.page.getByRole('region', { name: 'Impact preview' })).toContainText(pattern);
  }

  async submit(): Promise<string> {
    const submit = this.waitForApi('POST', '/api/v1/sdwan/change-requests');
    await this.form.getByRole('button', { name: 'Submit for approval' }).click();
    const response = await submit;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    await this.expectToast(/submitted for approval/i);
    return body.id;
  }

  async submitExpectingValidation(field: string, message: RegExp): Promise<void> {
    await this.form.getByRole('button', { name: 'Submit for approval' }).click();
    const input = this.form.getByLabel(field);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy, `${field} should reference its error message`).toBeTruthy();
    await expect(this.page.locator(`#${describedBy}`)).toHaveText(message);
  }

  async expectStatus(changeRequestId: string, status: string): Promise<void> {
    await expect(this.row(changeRequestId).getByTestId('cr-status')).toHaveAttribute('data-status', status);
  }

  async approve(changeRequestId: string, comment: string): Promise<void> {
    await this.row(changeRequestId).getByRole('button', { name: 'Review' }).click();
    const dialog = this.page.getByRole('dialog', { name: `Review ${changeRequestId}` });
    await dialog.getByLabel('Approval comment').fill(comment);
    const approve = this.waitForApi('POST', `/change-requests/${changeRequestId}/approve`);
    await dialog.getByRole('button', { name: 'Approve and schedule' }).click();
    await approve;
    await expect(dialog).toBeHidden();
  }

  async reject(changeRequestId: string, reason: string): Promise<void> {
    await this.row(changeRequestId).getByRole('button', { name: 'Review' }).click();
    const dialog = this.page.getByRole('dialog', { name: `Review ${changeRequestId}` });
    await dialog.getByLabel('Approval comment').fill(reason);
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(dialog).toBeHidden();
  }
}

function typeLabel(type: ChangeRequestDraft['type']): string {
  return {
    BANDWIDTH: 'Bandwidth change',
    FIREWALL_RULE: 'Firewall rule',
    BUSINESS_POLICY: 'Business policy',
    EDGE_REPLACEMENT: 'Edge replacement',
  }[type];
}

function toDateTimeLocal(date: Date): string {
  return date.toISOString().slice(0, 16);
}

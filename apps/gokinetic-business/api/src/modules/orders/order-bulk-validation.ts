import { AuthContext, canAccessSite } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { BulkRowError, OrderRequest } from './orders.types';

export const MAX_BULK_ITEMS = 200;

/** Finds rows within one bulk upload that would conflict with each other. */
export function findIntraBatchConflicts(items: OrderRequest[]): BulkRowError[] {
  const errors: BulkRowError[] = [];
  const seenService = new Map<string, number>();
  const seenProvide = new Map<string, number>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const row = index + 1;

    if (item.serviceId) {
      const prior = seenService.get(item.serviceId);
      if (prior !== undefined) {
        errors.push({ row, field: 'serviceId', message: `Service is already modified by row ${prior}` });
      } else {
        seenService.set(item.serviceId, row);
      }
    }

    if (item.orderType === 'PROVIDE') {
      const prior = seenProvide.get(item.siteId);
      if (prior !== undefined) {
        errors.push({ row, field: 'siteId', message: `Site already has a PROVIDE in row ${prior}` });
      } else {
        seenProvide.set(item.siteId, row);
      }
    }
  }
  return errors;
}

/** True when the user can access both the site and (if any) the target site. */
export function canAccessRequestSites(ctx: AuthContext, request: OrderRequest): boolean {
  if (!canAccessSite(ctx, request.siteId)) return false;
  if (request.targetSiteId && !canAccessSite(ctx, request.targetSiteId)) return false;
  return true;
}

/** Row errors for every item whose sites the user cannot access. */
export function findSiteAccessErrors(ctx: AuthContext, items: OrderRequest[]): BulkRowError[] {
  const errors: BulkRowError[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!canAccessRequestSites(ctx, items[i])) {
      errors.push({ row: i + 1, field: 'siteId', message: 'You do not have access to this site' });
    }
  }
  return errors;
}

export function assertBatchSize(items: OrderRequest[]): void {
  if (items.length === 0) throw new BusinessRuleError('empty-batch', 'A bulk order needs at least one item');
  if (items.length > MAX_BULK_ITEMS) {
    throw new BusinessRuleError('batch-too-large', `A bulk order may contain at most ${MAX_BULK_ITEMS} items`);
  }
}

/** Throws one error listing every failing row, sorted by row number. */
export function throwIfRowErrors(rowErrors: BulkRowError[]): void {
  if (rowErrors.length === 0) return;
  rowErrors.sort((a, b) => a.row - b.row);
  const failedRows = new Set(rowErrors.map((e) => e.row)).size;
  throw new BusinessRuleError('bulk-validation-failed', `${failedRows} row(s) failed validation`, { rowErrors });
}

export const ORDER_TYPES = ['PROVIDE', 'MOVE', 'ADD', 'CHANGE', 'CEASE'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const OPEN_ORDER_STATUSES: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING'];

export interface Order {
  id: string;
  accountId: string;
  batchId: string | null;
  reference: string;
  orderType: OrderType;
  status: OrderStatus;
  siteId: string;
  targetSiteId: string | null;
  serviceId: string | null;
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  currency: string;
  requiresApproval: boolean;
  approvedBy: string | null;
  requestedDate: string | null;
  notes: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface OrderRequest {
  orderType: OrderType;
  siteId: string;
  targetSiteId?: string | null;
  serviceId?: string | null;
  productCode?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}

export interface OrderBatch {
  id: string;
  reference: string;
  itemCount: number;
  orders: Order[];
}

export interface BulkRowError {
  row: number;
  field: string;
  message: string;
}

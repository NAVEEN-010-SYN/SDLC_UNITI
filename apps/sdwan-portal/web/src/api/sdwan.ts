import type { ApiClient } from './client';
import type {
  Alert,
  AlertSeverity,
  AlertStatus,
  BusinessPolicy,
  ChangeRequest,
  ChangeRequestView,
  ChangeStatus,
  CreateChangeRequest,
  Edge,
  EdgeHealth,
  EdgeStatus,
  Finding,
  FirewallRule,
  FirewallView,
  InventorySummary,
  Page,
  PolicyView,
  SdwanEvent,
  Site,
  Vendor,
  WindowOccurrence,
} from './types';

export interface PageQuery {
  page: number;
  pageSize: number;
}

/** Typed endpoint bindings for one account; every path lives here so pages never build URLs. */
export function sdwanApi(client: ApiClient, accountId: string) {
  const a = `/accounts/${encodeURIComponent(accountId)}`;
  const id = encodeURIComponent;
  return {
    summary: (signal?: AbortSignal) => client.get<InventorySummary>(`${a}/summary`, { signal }),
    sites: (q: PageQuery, signal?: AbortSignal) => client.get<Page<Site>>(`${a}/sites`, { query: { ...q }, signal }),
    edges: (q: PageQuery & { status?: EdgeStatus; vendor?: Vendor; q?: string; siteId?: string }, signal?: AbortSignal) =>
      client.get<Page<Edge>>(`${a}/edges`, { query: { ...q }, signal }),
    edge: (edgeId: string, signal?: AbortSignal) => client.get<Edge>(`${a}/edges/${id(edgeId)}`, { signal }),
    edgeHealth: (edgeId: string, range: { from: string; to: string }, signal?: AbortSignal) =>
      client.get<EdgeHealth>(`${a}/edges/${id(edgeId)}/health`, { query: range, signal }),
    events: (q: { from: string; to: string; edgeId?: string; limit?: number }, signal?: AbortSignal) =>
      client.get<{ items: SdwanEvent[]; unavailable: Vendor[] }>(`${a}/events`, { query: q, signal }),

    policies: (edgeId: string, signal?: AbortSignal) => client.get<PolicyView>(`${a}/edges/${id(edgeId)}/policies`, { signal }),
    previewPolicies: (edgeIds: string[], policies: BusinessPolicy[]) =>
      client.post<{ valid: boolean; issues: Finding[]; warnings: Array<{ policyId: string; message: string; vendor: Vendor }> }>(
        `${a}/policies/preview`,
        { edgeIds, policies },
      ),
    firewall: (edgeId: string, signal?: AbortSignal) => client.get<FirewallView>(`${a}/edges/${id(edgeId)}/firewall-rules`, { signal }),
    previewFirewall: (rules: FirewallRule[]) => client.post<{ valid: boolean; findings: Finding[] }>(`${a}/firewall-rules/preview`, { rules }),

    alerts: (q: PageQuery & { status?: AlertStatus; severity?: AlertSeverity; edgeId?: string }, signal?: AbortSignal) =>
      client.get<Page<Alert>>(`${a}/alerts`, { query: { ...q }, signal }),
    acknowledgeAlert: (alertId: string) => client.post<Alert>(`${a}/alerts/${id(alertId)}/acknowledge`),

    changes: (q: PageQuery & { status?: ChangeStatus }, signal?: AbortSignal) =>
      client.get<Page<ChangeRequest>>(`${a}/change-requests`, { query: { ...q }, signal }),
    change: (crId: string, signal?: AbortSignal) => client.get<ChangeRequestView>(`${a}/change-requests/${id(crId)}`, { signal }),
    createChange: (body: CreateChangeRequest) => client.post<ChangeRequestView>(`${a}/change-requests`, body),
    submitChange: (crId: string) => client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/submit`),
    decideChange: (crId: string, decision: 'APPROVE' | 'REJECT', comment?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/decisions`, { decision, ...(comment ? { comment } : {}) }),
    scheduleChange: (crId: string, scheduledFor: string, maintenanceWindowId?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/schedule`, { scheduledFor, ...(maintenanceWindowId ? { maintenanceWindowId } : {}) }),
    cancelChange: (crId: string, reason?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/cancel`, reason ? { reason } : {}),
    upcomingWindows: (days = 14, signal?: AbortSignal) =>
      client.get<WindowOccurrence[]>(`${a}/maintenance-windows/upcoming`, { query: { days }, signal }),
  };
}

export type SdwanApi = ReturnType<typeof sdwanApi>;

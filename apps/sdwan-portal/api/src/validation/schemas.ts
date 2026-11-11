import { z } from 'zod';
import { isValidCidr } from '../domain/cidr';
import { unknownApplications } from '../providers/applicationCatalog';

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(s), {
  message: 'must be an ISO-8601 date-time with timezone',
});

export const accountIdParam = z.string().regex(/^ACC-\d{8}$/, 'accountId must look like ACC-########');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const timeRangeQuery = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .transform((v) => {
    const to = v.to ?? new Date().toISOString();
    const from = v.from ?? new Date(Date.parse(to) - 24 * 3_600_000).toISOString();
    return { from, to };
  })
  .refine((v) => Date.parse(v.from) < Date.parse(v.to), { message: '"from" must be before "to"' })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 93 * 86_400_000, { message: 'range may not exceed 93 days' });

const cidr = z.string().refine(isValidCidr, { message: 'must be an IPv4 CIDR such as 10.0.0.0/24' });

const portRange = z
  .object({ from: z.number().int().min(1).max(65535), to: z.number().int().min(1).max(65535) })
  .refine((p) => p.from <= p.to, { message: '"from" must be <= "to"' });

const protocol = z.enum(['TCP', 'UDP', 'ICMP', 'ANY']);
const transport = z.enum(['FIBRE', 'BROADBAND', 'LTE', 'MPLS']);

export const slaSchema = z.object({
  maxLatencyMs: z.number().positive().max(5000),
  maxJitterMs: z.number().min(0).max(1000),
  maxLossPct: z.number().min(0).max(100),
});

export const businessPolicySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(60),
    order: z.number().int().min(0).max(100000),
    enabled: z.boolean().default(true),
    match: z
      .object({
        applications: z
          .array(z.string())
          .max(20)
          .optional()
          .superRefine((apps, ctx) => {
            const unknown = unknownApplications(apps ?? []);
            if (unknown.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown application(s): ${unknown.join(', ')}` });
          }),
        sourceCidrs: z.array(cidr).max(32).optional(),
        destinationCidrs: z.array(cidr).max(32).optional(),
        protocol: protocol.optional(),
        destinationPorts: z.array(portRange).max(16).optional(),
        dscp: z.number().int().min(0).max(63).optional(),
      })
      .strict(),
    action: z
      .object({
        serviceClass: z.enum(['REALTIME', 'TRANSACTIONAL', 'BULK']),
        priority: z.enum(['HIGH', 'NORMAL', 'LOW']),
        steering: z.enum(['BEST_PATH', 'PREFERRED_TRANSPORT', 'LOAD_BALANCE', 'MANDATORY_TRANSPORT']),
        preferredTransport: transport.optional(),
        sla: slaSchema.optional(),
        rateLimitKbps: z.number().int().min(64).max(10_000_000).optional(),
        dscpRemark: z.number().int().min(0).max(63).optional(),
      })
      .strict()
      .refine(
        (a) => !(a.steering === 'PREFERRED_TRANSPORT' || a.steering === 'MANDATORY_TRANSPORT') || !!a.preferredTransport,
        { message: 'preferredTransport is required for transport steering', path: ['preferredTransport'] },
      ),
  })
  .strict();

export const firewallRuleSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(35),
    sequence: z.number().int().min(1).max(100000),
    enabled: z.boolean().default(true),
    action: z.enum(['ALLOW', 'DENY']),
    protocol,
    sourceCidrs: z.array(cidr).max(32),
    destinationCidrs: z.array(cidr).max(32),
    destinationPorts: z.array(portRange).max(16),
    log: z.boolean().default(false),
  })
  .strict()
  .refine((r) => !(r.protocol === 'ICMP' && r.destinationPorts.length > 0), {
    message: 'ICMP rules cannot specify ports',
    path: ['destinationPorts'],
  });

const payloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('POLICY_UPDATE'), policies: z.array(businessPolicySchema).max(500) }),
  z.object({ type: z.literal('FIREWALL_UPDATE'), rules: z.array(firewallRuleSchema).max(1000) }),
  z.object({ type: z.literal('CONFIG_ROLLBACK'), backupId: z.string().min(1) }),
  z.object({ type: z.literal('SOFTWARE_UPGRADE'), targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be x.y.z') }),
  z.object({ type: z.literal('EDGE_REBOOT') }),
]);

export const createChangeRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().max(2000).optional(),
    edgeIds: z.array(z.string().min(1)).min(1).max(100),
    payload: payloadSchema,
    emergency: z.boolean().default(false),
    submit: z.boolean().default(false),
  })
  .strict()
  .refine((v) => new Set(v.edgeIds).size === v.edgeIds.length, { message: 'edgeIds must be unique', path: ['edgeIds'] })
  .refine((v) => v.payload.type !== 'CONFIG_ROLLBACK' || v.edgeIds.length === 1, {
    message: 'a rollback targets exactly one edge',
    path: ['edgeIds'],
  });

export const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    comment: z.string().max(1000).optional(),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || (v.comment && v.comment.trim().length >= 5), {
    message: 'a rejection requires a comment of at least 5 characters',
    path: ['comment'],
  });

export const scheduleSchema = z
  .object({
    maintenanceWindowId: z.string().min(1).optional(),
    scheduledFor: isoDateTime,
  })
  .strict();

export const maintenanceWindowSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm (UTC)'),
    durationMinutes: z.number().int().min(30).max(720),
    blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100).default([]),
  })
  .strict();

export const createBackupSchema = z.object({ edgeId: z.string().min(1) }).strict();

export const alertQuerySchema = paginationQuery.extend({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR', 'INFO']).optional(),
  edgeId: z.string().optional(),
});

export const changeQuerySchema = paginationQuery.extend({
  status: z
    .enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
  type: z.enum(['POLICY_UPDATE', 'FIREWALL_UPDATE', 'CONFIG_ROLLBACK', 'SOFTWARE_UPGRADE', 'EDGE_REBOOT']).optional(),
});

export const reportQuerySchema = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM'),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export type MaintenanceWindowInput = z.infer<typeof maintenanceWindowSchema>;

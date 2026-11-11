import type { BusinessPolicy, FirewallRule, PolicyPriority, ServiceClass, SteeringMode, Transport } from '../../domain/types';
import { defaultPriorityFor } from '../../domain/policyTranslation';
import { VCO_ANY, expandMatch, expandedName, foldMatches, groupExpanded, mapTransport, slug } from './velocloudMatch';
import type { VcoFirewallRule, VcoPriority, VcoQosRule, VcoQosType, VcoRouteAction, VcoScheduler } from './velocloudTypes';

// ---------------------------------------------------------------------------
// Business policy translation
// ---------------------------------------------------------------------------

const CLASS_TO_VCO: Record<ServiceClass, VcoQosType> = {
  REALTIME: 'realtime',
  TRANSACTIONAL: 'transactional',
  BULK: 'bulk',
};

const PRIORITY_TO_VCO: Record<PolicyPriority, VcoPriority> = { HIGH: 'high', NORMAL: 'normal', LOW: 'low' };

function steeringToVco(policy: BusinessPolicy): VcoRouteAction {
  const tag = policy.action.preferredTransport?.toLowerCase();
  switch (policy.action.steering) {
    case 'BEST_PATH':
      return { linkPolicy: 'auto', serviceGroup: 'ALL' };
    case 'LOAD_BALANCE':
      return { linkPolicy: 'loadBalance', serviceGroup: 'ALL' };
    case 'PREFERRED_TRANSPORT':
      return { linkPolicy: 'fixed', wanlinkPolicy: 'preferred', linkTag: tag, serviceGroup: 'ALL' };
    case 'MANDATORY_TRANSPORT':
      return { linkPolicy: 'fixed', wanlinkPolicy: 'mandatory', linkTag: tag, serviceGroup: 'ALL' };
  }
}

function steeringFromVco(r: VcoRouteAction): { steering: SteeringMode; preferredTransport?: Transport } {
  if (r.linkPolicy === 'loadBalance') return { steering: 'LOAD_BALANCE' };
  if (r.linkPolicy === 'auto') return { steering: 'BEST_PATH' };
  const transport = r.linkTag ? mapTransport({ networkType: null, linkTag: r.linkTag }) : undefined;
  return {
    steering: r.wanlinkPolicy === 'mandatory' ? 'MANDATORY_TRANSPORT' : 'PREFERRED_TRANSPORT',
    preferredTransport: transport && transport !== 'UNKNOWN' ? transport : undefined,
  };
}

function serviceClassFromVco(type: VcoQosType): ServiceClass {
  for (const key of Object.keys(CLASS_TO_VCO) as ServiceClass[]) {
    if (CLASS_TO_VCO[key] === type) return key;
  }
  return 'TRANSACTIONAL';
}

function priorityFromVco(priority: VcoPriority): PolicyPriority | undefined {
  for (const key of Object.keys(PRIORITY_TO_VCO) as PolicyPriority[]) {
    if (PRIORITY_TO_VCO[key] === priority) return key;
  }
  return undefined;
}

export function policiesToVco(policies: BusinessPolicy[]): VcoQosRule[] {
  const ordered = [...policies].sort((a, b) => a.order - b.order);
  const rules: VcoQosRule[] = [];
  for (const p of ordered) {
    const matches = expandMatch(p.match);
    const scheduler: VcoScheduler = { priority: PRIORITY_TO_VCO[p.action.priority], bandwidthCapPct: VCO_ANY, queueLen: VCO_ANY };
    for (let i = 0; i < matches.length; i++) {
      rules.push({
        name: expandedName(p.name, i, matches.length),
        ruleOrder: rules.length,
        disabled: !p.enabled,
        match: matches[i],
        action: {
          routeType: 'edge2Any',
          allowConversion: true,
          QoS: {
            type: CLASS_TO_VCO[p.action.serviceClass],
            rxScheduler: scheduler,
            txScheduler: scheduler,
            rateLimitKbps: p.action.rateLimitKbps ?? VCO_ANY,
            dscpRemark: p.action.dscpRemark,
          },
          edge2EdgeRouteAction: steeringToVco(p),
        },
      });
    }
  }
  return rules;
}

export function policiesFromVco(rules: VcoQosRule[]): BusinessPolicy[] {
  const groups = groupExpanded(rules);
  const result: BusinessPolicy[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const first = group.members[0];
    const qos = first.action.QoS;
    const cls = serviceClassFromVco(qos.type);
    const folded = foldMatches(group.members.map((m) => m.match));
    const rate = qos.rateLimitKbps;
    const steering = steeringFromVco(first.action.edge2EdgeRouteAction);
    result.push({
      id: `vco-qos-${slug(group.name)}`,
      name: group.name,
      order: (i + 1) * 10,
      enabled: !first.disabled,
      match: { ...folded, protocol: folded.protocol },
      action: {
        serviceClass: cls,
        priority: priorityFromVco(qos.rxScheduler.priority) ?? defaultPriorityFor(cls),
        steering: steering.steering,
        preferredTransport: steering.preferredTransport,
        rateLimitKbps: rate !== undefined && rate !== VCO_ANY ? rate : undefined,
        dscpRemark: qos.dscpRemark,
      },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Firewall translation
// ---------------------------------------------------------------------------

export function firewallToVco(rules: FirewallRule[]): VcoFirewallRule[] {
  const out: VcoFirewallRule[] = [];
  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);
  for (const r of sorted) {
    const matches = expandMatch({
      sourceCidrs: r.sourceCidrs,
      destinationCidrs: r.destinationCidrs,
      destinationPorts: r.protocol === 'ICMP' ? [] : r.destinationPorts,
      protocol: r.protocol,
    });
    for (let i = 0; i < matches.length; i++) {
      out.push({
        name: expandedName(r.name, i, matches.length),
        disabled: !r.enabled,
        match: matches[i],
        action: { allow_or_deny: r.action === 'ALLOW' ? 'allow' : 'deny' },
        loggingEnabled: r.log,
      });
    }
  }
  return out;
}

export function firewallFromVco(rules: VcoFirewallRule[]): FirewallRule[] {
  return groupExpanded(rules).map((group, i) => {
    const first = group.members[0];
    const folded = foldMatches(group.members.map((m) => m.match));
    return {
      id: `vco-fw-${slug(group.name)}`,
      name: group.name,
      sequence: (i + 1) * 10,
      enabled: !first.disabled,
      action: first.action.allow_or_deny === 'allow' ? 'ALLOW' : 'DENY',
      protocol: folded.protocol,
      sourceCidrs: folded.sourceCidrs ?? [],
      destinationCidrs: folded.destinationCidrs ?? [],
      destinationPorts: folded.destinationPorts ?? [],
      log: first.loggingEnabled,
    };
  });
}

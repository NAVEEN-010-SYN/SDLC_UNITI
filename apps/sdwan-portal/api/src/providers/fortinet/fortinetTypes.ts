/**
 * Subset of FortiManager JSON-RPC and FortiOS REST shapes consumed by the adapter.
 * Hyphenated keys mirror the FortiOS CLI attribute names, as the APIs return them.
 */

export interface FmgStatus {
  code: number;
  message: string;
}

export interface FmgResult<T> {
  status: FmgStatus;
  url: string;
  data?: T;
}

export interface FmgResponse<T> {
  id: number;
  result: Array<FmgResult<T>>;
  session?: string;
}

export interface FmgDevice {
  name: string;
  sn: string;
  platform_str: string;
  os_ver: number;
  mr: number;
  patch: number;
  build?: number;
  /** 1 = connected, 2 = down, 0 = unknown. */
  conn_status: 0 | 1 | 2;
  /** 0 = standalone, 1 = active-passive, 2 = active-active. */
  ha_mode: 0 | 1 | 2;
  ha_slave?: Array<{ name: string; sn: string; role: 'master' | 'slave' | 'primary' | 'secondary'; status: 0 | 1 }>;
  last_checked?: number;
  desc?: string;
  'meta fields'?: Record<string, string>;
}

export interface FmgDeviceGroup {
  name: string;
  desc?: string;
  'object member'?: Array<{ name: string; vdom?: string }>;
}

export interface FgtInterface {
  name: string;
  role: 'wan' | 'lan' | 'dmz' | 'undefined';
  description?: string;
  ip?: [string, string];
  status?: 'up' | 'down';
  'estimated-upstream-bandwidth'?: number;
  'estimated-downstream-bandwidth'?: number;
  alias?: string;
}

export interface FgtSdwanMember {
  'seq-num': number;
  interface: string;
  status: 'enable' | 'disable';
  gateway?: string;
  cost?: number;
  zone?: string;
  comment?: string;
}

export interface FgtSlaTarget {
  id: number;
  'latency-threshold': number;
  'jitter-threshold': number;
  'packetloss-threshold': number;
}

export interface FgtHealthCheck {
  name: string;
  server: string[];
  protocol: 'ping' | 'http' | 'dns' | 'twamp';
  members: number[];
  sla: FgtSlaTarget[];
}

export type FgtServiceMode = 'auto' | 'manual' | 'priority' | 'sla' | 'load-balance';

export interface FgtSdwanService {
  id: number;
  name: string;
  status: 'enable' | 'disable';
  mode: FgtServiceMode;
  /** Address object names; "all" when unrestricted. */
  src: string[];
  dst: string[];
  protocol: number;
  'start-port': number;
  'end-port': number;
  'internet-service': 'enable' | 'disable';
  'internet-service-app-ctrl': number[];
  'priority-members': number[];
  'health-check'?: string[];
  sla?: Array<{ 'health-check': string; id: number }>;
  'dscp-forward': 'enable' | 'disable';
  'dscp-forward-tag'?: string;
  tos?: string;
  'tos-mask'?: string;
  /** Free text; the portal stores neutral metadata the vendor cannot express here. */
  comment?: string;
}

export interface FgtAddress {
  name: string;
  type: 'ipmask' | 'iprange' | 'fqdn';
  subnet?: [string, string];
  comment?: string;
}

export interface FgtService {
  name: string;
  protocol: 'TCP/UDP/SCTP' | 'ICMP' | 'IP';
  'tcp-portrange'?: string;
  'udp-portrange'?: string;
  comment?: string;
}

export interface FgtFirewallPolicy {
  policyid: number;
  name: string;
  status: 'enable' | 'disable';
  srcintf: string[];
  dstintf: string[];
  srcaddr: string[];
  dstaddr: string[];
  service: string[];
  action: 'accept' | 'deny';
  schedule: string;
  logtraffic: 'all' | 'utm' | 'disable';
  comments?: string;
}

/** /api/v2/monitor/virtual-wan/health-check result: health-check name → member interface → stats. */
export type FgtHealthCheckMonitor = Record<
  string,
  Record<
    string,
    {
      status: 'up' | 'down' | 'error';
      latency?: number;
      jitter?: number;
      packet_loss?: number;
      tx_bandwidth?: number;
      rx_bandwidth?: number;
      state_changed?: number;
    }
  >
>;

export interface FgtEventLog {
  eventtime: number;
  logid: string;
  level: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'information' | 'debug';
  subtype: 'system' | 'sdwan' | 'ha' | 'vpn' | 'user' | 'router';
  logdesc: string;
  msg: string;
  cfgpath?: string;
}

export interface FgtProxyResponse<T> {
  target: string;
  status: FmgStatus;
  response?: { http_status: number; results: T; status: 'success' | 'error' };
}

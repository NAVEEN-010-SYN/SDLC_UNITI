/**
 * Neutral application names exposed to customers, with the identifiers each vendor's
 * DPI engine uses. Only applications offered in the managed SD-WAN product catalogue
 * are listed; the UI only allows selecting from this list.
 */
export interface ApplicationDef {
  key: string;
  label: string;
  category: 'COLLABORATION' | 'SAAS' | 'VOICE' | 'STREAMING' | 'BACKUP' | 'UPDATES';
  velocloudAppId: number;
  fortinetAppId: number;
}

export const APPLICATIONS: ApplicationDef[] = [
  { key: 'ms-teams', label: 'Microsoft Teams', category: 'COLLABORATION', velocloudAppId: 2069, fortinetAppId: 43541 },
  { key: 'zoom', label: 'Zoom', category: 'COLLABORATION', velocloudAppId: 1904, fortinetAppId: 38446 },
  { key: 'webex', label: 'Cisco Webex', category: 'COLLABORATION', velocloudAppId: 351, fortinetAppId: 16166 },
  { key: 'office365', label: 'Microsoft 365', category: 'SAAS', velocloudAppId: 1713, fortinetAppId: 33182 },
  { key: 'salesforce', label: 'Salesforce', category: 'SAAS', velocloudAppId: 300, fortinetAppId: 16920 },
  { key: 'google-workspace', label: 'Google Workspace', category: 'SAAS', velocloudAppId: 1471, fortinetAppId: 34050 },
  { key: 'sip', label: 'SIP Voice', category: 'VOICE', velocloudAppId: 58, fortinetAppId: 15520 },
  { key: 'youtube', label: 'YouTube', category: 'STREAMING', velocloudAppId: 467, fortinetAppId: 31077 },
  { key: 'netflix', label: 'Netflix', category: 'STREAMING', velocloudAppId: 1027, fortinetAppId: 18155 },
  { key: 'veeam', label: 'Veeam Backup', category: 'BACKUP', velocloudAppId: 2210, fortinetAppId: 40166 },
  { key: 'windows-update', label: 'Windows Update', category: 'UPDATES', velocloudAppId: 418, fortinetAppId: 16190 },
];

const byKey = new Map(APPLICATIONS.map((a) => [a.key, a]));
const byVelo = new Map(APPLICATIONS.map((a) => [a.velocloudAppId, a]));
const byForti = new Map(APPLICATIONS.map((a) => [a.fortinetAppId, a]));

export function applicationByKey(key: string): ApplicationDef | undefined {
  return byKey.get(key.toLowerCase());
}

export function applicationByVelocloudId(id: number): ApplicationDef | undefined {
  return byVelo.get(id);
}

export function applicationByFortinetId(id: number): ApplicationDef | undefined {
  return byForti.get(id);
}

export function unknownApplications(keys: string[]): string[] {
  return keys.filter((k) => !byKey.has(k.toLowerCase()));
}

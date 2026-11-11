export const BUSINESS_ROLES = ['BUSINESS_ADMIN', 'BUSINESS_USER'] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface BusinessUser {
  id: string;
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  status: UserStatus;
  siteScope: string[] | null;
  invitedBy: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
}

export type UserAction = 'suspend' | 'reactivate' | 'deactivate';

/** Allowed lifecycle transitions keyed by action. */
export const USER_TRANSITIONS: Record<UserAction, { from: UserStatus[]; to: UserStatus }> = {
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
  reactivate: { from: ['SUSPENDED'], to: 'ACTIVE' },
  deactivate: { from: ['INVITED', 'ACTIVE', 'SUSPENDED'], to: 'DEACTIVATED' }
};

/** Maximum number of non-deactivated portal users per business account. */
export const MAX_USERS_PER_ACCOUNT = 250;

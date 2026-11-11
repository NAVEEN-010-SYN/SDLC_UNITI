import { Db } from '../../db/query';
import { NotFoundError } from '../../lib/errors';
import { SlaTier } from '../inventory/inventory.types';

export interface Account {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  currency: string;
  slaTier: SlaTier;
  /** Orders whose annualised impact exceeds this need admin approval; 0 disables approvals. */
  approvalThresholdMinor: number;
}

interface AccountRow {
  id: string;
  name: string;
  status: Account['status'];
  currency: string;
  sla_tier: SlaTier;
  approval_threshold_minor: string;
}

export interface AccountsRepository {
  get(accountId: string): Promise<Account>;
  updateApprovalThreshold(accountId: string, thresholdMinor: number): Promise<Account>;
}

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    currency: r.currency,
    slaTier: r.sla_tier,
    approvalThresholdMinor: Number(r.approval_threshold_minor)
  };
}

export function createAccountsRepository(db: Db): AccountsRepository {
  return {
    async get(accountId) {
      const row = await db.oneOrNone<AccountRow>('SELECT * FROM accounts WHERE id = $1', [accountId]);
      if (!row) throw new NotFoundError('Account', accountId);
      return toAccount(row);
    },

    async updateApprovalThreshold(accountId, thresholdMinor) {
      const row = await db.oneOrNone<AccountRow>(
        'UPDATE accounts SET approval_threshold_minor = $2 WHERE id = $1 RETURNING *',
        [accountId, thresholdMinor]
      );
      if (!row) throw new NotFoundError('Account', accountId);
      return toAccount(row);
    }
  };
}

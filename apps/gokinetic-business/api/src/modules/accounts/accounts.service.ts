import { AuthContext, Permission, isAdmin, permissionsFor } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ForbiddenError } from '../../lib/errors';
import { AuditRepository } from '../audit/audit.repository';
import { Account, AccountsRepository } from './accounts.repository';

/** Upper bound for the order approval threshold (annualised impact), £250,000. */
export const MAX_APPROVAL_THRESHOLD_MINOR = 25_000_000;

export interface Me {
  userId: string;
  email: string;
  roles: AuthContext['roles'];
  accountId: string;
  siteScope: string[] | null;
  permissions: Permission[];
  account: Pick<Account, 'id' | 'name' | 'status' | 'slaTier' | 'currency'>;
}

export class AccountsService {
  constructor(
    private readonly db: Db,
    private readonly repo: AccountsRepository,
    private readonly audit: AuditRepository
  ) {}

  /** Session bootstrap for the portal: who am I, what can I do, and on which account. */
  async me(ctx: AuthContext): Promise<Me> {
    const account = await this.repo.get(ctx.accountId);
    return {
      userId: ctx.userId,
      email: ctx.email,
      roles: ctx.roles,
      accountId: ctx.accountId,
      siteScope: ctx.siteScope,
      permissions: [...permissionsFor(ctx.roles)].sort(),
      account: { id: account.id, name: account.name, status: account.status, slaTier: account.slaTier, currency: account.currency }
    };
  }

  get(ctx: AuthContext): Promise<Account> {
    return this.repo.get(ctx.accountId);
  }

  /**
   * Sets the annualised spend above which a BUSINESS_USER's order needs admin approval.
   * Zero disables approvals entirely.
   */
  async updateApprovalThreshold(ctx: AuthContext, thresholdMinor: number): Promise<Account> {
    if (!isAdmin(ctx)) throw new ForbiddenError('Only business admins can change the approval threshold');
    if (!Number.isSafeInteger(thresholdMinor) || thresholdMinor < 0 || thresholdMinor > MAX_APPROVAL_THRESHOLD_MINOR) {
      throw new BusinessRuleError('approval-threshold-range', `Threshold must be between 0 and ${MAX_APPROVAL_THRESHOLD_MINOR} minor units`);
    }
    return this.db.tx(async (tx) => {
      const before = await this.repo.get(ctx.accountId);
      if (before.status === 'CLOSED') throw new BusinessRuleError('account-closed', 'Closed accounts cannot be modified');
      if (before.approvalThresholdMinor === thresholdMinor) return before;
      const updated = await this.repo.updateApprovalThreshold(ctx.accountId, thresholdMinor);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'account.approval_threshold_changed',
          entity: 'account',
          entityId: ctx.accountId,
          details: { from: before.approvalThresholdMinor, to: thresholdMinor }
        },
        tx
      );
      return updated;
    });
  }
}

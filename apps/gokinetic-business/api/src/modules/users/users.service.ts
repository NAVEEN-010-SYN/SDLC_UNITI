import { AuthContext } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { Page, PageRequest } from '../../lib/pagination';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { UserFilter, UserPatch, UsersRepository } from './users.repository';
import { BusinessRole, BusinessUser, MAX_USERS_PER_ACCOUNT, USER_TRANSITIONS, UserAction } from './users.types';

const AUDIT_ACTIONS: Record<UserAction, string> = {
  suspend: 'user.suspended',
  reactivate: 'user.reactivated',
  deactivate: 'user.deactivated'
};

export interface InvitationSender {
  sendInvitation(user: BusinessUser, invitedByEmail: string): Promise<void>;
}

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  siteScope?: string[] | null;
}

export interface ChangeRoleInput {
  role: BusinessRole;
  siteScope?: string[] | null;
  version: number;
}

/**
 * Resolves the effective site scope for a role. Admins always see every site, so any
 * supplied scope is rejected rather than silently discarded.
 */
export function resolveSiteScope(role: BusinessRole, scope: string[] | null | undefined): string[] | null {
  if (role === 'BUSINESS_ADMIN') {
    if (scope && scope.length > 0) {
      throw new BusinessRuleError('admin-site-scope', 'Business admins cannot be restricted to specific sites');
    }
    return null;
  }
  if (scope === undefined || scope === null) return null;
  const unique = Array.from(new Set(scope));
  if (unique.length === 0) {
    throw new BusinessRuleError('empty-site-scope', 'A site scope, when given, must contain at least one site');
  }
  return unique;
}

export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly repo: UsersRepository,
    private readonly inventory: InventoryRepository,
    private readonly invitations: InvitationSender,
    private readonly audit: AuditRepository
  ) {}

  list(ctx: AuthContext, filter: UserFilter, page: PageRequest): Promise<Page<BusinessUser>> {
    return this.repo.list(ctx.accountId, filter, page);
  }

  async get(ctx: AuthContext, userId: string): Promise<BusinessUser> {
    const user = await this.repo.find(ctx.accountId, userId);
    if (!user) throw new NotFoundError('User', userId);
    return user;
  }

  async invite(ctx: AuthContext, input: InviteUserInput): Promise<BusinessUser> {
    const siteScope = resolveSiteScope(input.role, input.siteScope);
    if (siteScope) await this.assertSitesUsable(ctx.accountId, siteScope);

    const user = await this.db.tx(async (tx) => {
      const existing = await this.repo.findByEmail(ctx.accountId, input.email, tx);
      if (existing && existing.status !== 'DEACTIVATED') {
        throw new ConflictError(`${input.email} already has access to this account`, { userId: existing.id });
      }
      const seats = await this.repo.countSeats(ctx.accountId, tx);
      if (seats >= MAX_USERS_PER_ACCOUNT) {
        throw new BusinessRuleError('seat-limit', `This account has reached its limit of ${MAX_USERS_PER_ACCOUNT} users`);
      }
      const created = await this.saveInvitedUser(ctx, input, siteScope, existing, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: existing ? 'user.reinvited' : 'user.invited',
          entity: 'user',
          entityId: created.id,
          details: { role: created.role, siteScope }
        },
        tx
      );
      return created;
    });

    try {
      await this.invitations.sendInvitation(user, ctx.email);
    } catch (err) {
      // The user record is the source of truth; the invite can be re-sent from the portal.
      logger.warn('invitation delivery failed', { userId: user.id, err });
    }
    return user;
  }

  async changeRole(ctx: AuthContext, userId: string, input: ChangeRoleInput): Promise<BusinessUser> {
    if (userId === ctx.userId) {
      throw new BusinessRuleError('self-role-change', 'You cannot change your own role');
    }
    const siteScope = resolveSiteScope(input.role, input.siteScope);
    if (siteScope) await this.assertSitesUsable(ctx.accountId, siteScope);

    return this.db.tx(async (tx) => {
      const user = await this.requireUser(ctx.accountId, userId, tx);
      if (user.status === 'DEACTIVATED') {
        throw new BusinessRuleError('user-deactivated', 'Deactivated users cannot be modified');
      }
      if (user.role === 'BUSINESS_ADMIN' && input.role !== 'BUSINESS_ADMIN' && user.status === 'ACTIVE') {
        await this.assertNotLastAdmin(ctx.accountId, tx);
      }
      const updated = await this.repo.update(ctx.accountId, userId, input.version, { role: input.role, siteScope }, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'user.role_changed',
          entity: 'user',
          entityId: userId,
          details: { from: { role: user.role, siteScope: user.siteScope }, to: { role: input.role, siteScope } }
        },
        tx
      );
      return updated;
    });
  }

  async transition(ctx: AuthContext, userId: string, action: UserAction, version: number): Promise<BusinessUser> {
    if (userId === ctx.userId) {
      throw new BusinessRuleError('self-lifecycle', 'You cannot change the status of your own account');
    }
    const rule = USER_TRANSITIONS[action];
    return this.db.tx(async (tx) => {
      const user = await this.requireUser(ctx.accountId, userId, tx);
      if (!rule.from.includes(user.status)) {
        throw new InvalidStateTransitionError('User', user.status, rule.to);
      }
      if (user.role === 'BUSINESS_ADMIN' && user.status === 'ACTIVE' && rule.to !== 'ACTIVE') {
        await this.assertNotLastAdmin(ctx.accountId, tx);
      }
      const patch: UserPatch = { status: rule.to };
      const updated = await this.repo.update(ctx.accountId, userId, version, patch, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: AUDIT_ACTIONS[action],
          entity: 'user',
          entityId: userId,
          details: { from: user.status, to: rule.to }
        },
        tx
      );
      return updated;
    });
  }

  async resendInvitation(ctx: AuthContext, userId: string): Promise<void> {
    const user = await this.requireUser(ctx.accountId, userId);
    if (user.status !== 'INVITED') {
      throw new BusinessRuleError('not-invited', 'Only users with a pending invitation can be re-sent an invite');
    }
    await this.invitations.sendInvitation(user, ctx.email);
    await this.audit.record({
      accountId: ctx.accountId,
      actorId: ctx.userId,
      action: 'user.invitation_resent',
      entity: 'user',
      entityId: userId
    });
  }

  /** Re-invites a previously deactivated user, or inserts a new one. */
  private async saveInvitedUser(
    ctx: AuthContext,
    input: InviteUserInput,
    siteScope: string[] | null,
    existing: BusinessUser | null,
    tx: Db
  ): Promise<BusinessUser> {
    if (existing) {
      const patch: UserPatch = {
        status: 'INVITED',
        role: input.role,
        siteScope,
        firstName: input.firstName,
        lastName: input.lastName
      };
      return this.repo.update(ctx.accountId, existing.id, existing.version, patch, tx);
    }
    return this.repo.insert(
      {
        accountId: ctx.accountId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        siteScope,
        invitedBy: ctx.userId
      },
      tx
    );
  }

  private async requireUser(accountId: string, userId: string, db?: Db): Promise<BusinessUser> {
    const user = await this.repo.find(accountId, userId, db);
    if (!user) throw new NotFoundError('User', userId);
    return user;
  }

  private async assertNotLastAdmin(accountId: string, db: Db): Promise<void> {
    const admins = await this.repo.countActiveAdmins(accountId, db);
    if (admins <= 1) {
      throw new BusinessRuleError('last-admin', 'The account must keep at least one active business admin');
    }
  }

  private async assertSitesUsable(accountId: string, siteIds: string[]): Promise<void> {
    const sites = await this.inventory.findSitesByIds(accountId, siteIds);
    const usable = new Set(sites.filter((s) => s.status !== 'DECOMMISSIONED').map((s) => s.id));
    const invalid = siteIds.filter((id) => !usable.has(id));
    if (invalid.length > 0) {
      throw new BusinessRuleError('invalid-site-scope', 'Site scope contains unknown or decommissioned sites', {
        siteIds: invalid
      });
    }
  }
}

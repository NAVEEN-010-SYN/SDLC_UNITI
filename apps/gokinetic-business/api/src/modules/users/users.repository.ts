import { Db, WhereBuilder } from '../../db/query';
import { ConflictError } from '../../lib/errors';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { BusinessRole, BusinessUser, UserStatus } from './users.types';

interface UserRow {
  id: string;
  account_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: BusinessRole;
  status: UserStatus;
  site_scope: string[] | null;
  invited_by: string | null;
  last_login_at: Date | null;
  version: number;
  created_at: Date;
  total?: string;
}

function toUser(r: UserRow): BusinessUser {
  return {
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    status: r.status,
    siteScope: r.site_scope,
    invitedBy: r.invited_by,
    lastLoginAt: r.last_login_at?.toISOString() ?? null,
    version: r.version,
    createdAt: r.created_at.toISOString()
  };
}

export interface UserFilter {
  role?: BusinessRole;
  status?: UserStatus;
  search?: string;
}

export interface NewUser {
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  siteScope: string[] | null;
  invitedBy: string;
}

export type UserPatch = Partial<Pick<BusinessUser, 'role' | 'status' | 'siteScope' | 'firstName' | 'lastName'>>;

export interface UsersRepository {
  list(accountId: string, filter: UserFilter, page: PageRequest): Promise<Page<BusinessUser>>;
  find(accountId: string, userId: string, db?: Db): Promise<BusinessUser | null>;
  findByEmail(accountId: string, email: string, db?: Db): Promise<BusinessUser | null>;
  countActiveAdmins(accountId: string, db?: Db): Promise<number>;
  countSeats(accountId: string, db?: Db): Promise<number>;
  insert(user: NewUser, db?: Db): Promise<BusinessUser>;
  /** Applies a patch only if the stored version matches; bumps the version. */
  update(accountId: string, userId: string, expectedVersion: number, patch: UserPatch, db?: Db): Promise<BusinessUser>;
}

export function createUsersRepository(defaultDb: Db): UsersRepository {
  return {
    async list(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('role = ?', filter.role)
        .add('status = ?', filter.status);
      if (filter.search) {
        const p = where.nextParam(`%${filter.search.toLowerCase()}%`);
        where.addRaw(`(lower(email) LIKE ${p} OR lower(first_name || ' ' || last_name) LIKE ${p})`);
      }
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<UserRow>(
        `SELECT *, count(*) OVER() AS total FROM users ${where.toSql()}
          ORDER BY last_name, first_name
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toUser), page, rows.length ? Number(rows[0].total) : 0);
    },

    async find(accountId, userId, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE account_id = $1 AND id = $2', [accountId, userId]);
      return row ? toUser(row) : null;
    },

    async findByEmail(accountId, email, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE account_id = $1 AND lower(email) = lower($2)', [
        accountId,
        email
      ]);
      return row ? toUser(row) : null;
    },

    async countActiveAdmins(accountId, db = defaultDb) {
      const row = await db.one<{ n: string }>(
        `SELECT count(*) AS n FROM users WHERE account_id = $1 AND role = 'BUSINESS_ADMIN' AND status = 'ACTIVE'`,
        [accountId]
      );
      return Number(row.n);
    },

    async countSeats(accountId, db = defaultDb) {
      const row = await db.one<{ n: string }>(
        `SELECT count(*) AS n FROM users WHERE account_id = $1 AND status <> 'DEACTIVATED'`,
        [accountId]
      );
      return Number(row.n);
    },

    async insert(user, db = defaultDb) {
      const row = await db.one<UserRow>(
        `INSERT INTO users (account_id, email, first_name, last_name, role, status, site_scope, invited_by)
         VALUES ($1, lower($2), $3, $4, $5, 'INVITED', $6::uuid[], $7)
         RETURNING *`,
        [user.accountId, user.email, user.firstName, user.lastName, user.role, user.siteScope, user.invitedBy]
      );
      return toUser(row);
    },

    async update(accountId, userId, expectedVersion, patch, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>(
        `UPDATE users SET
            role = coalesce($4, role),
            status = coalesce($5, status),
            site_scope = CASE WHEN $6::boolean THEN $7::uuid[] ELSE site_scope END,
            first_name = coalesce($8, first_name),
            last_name = coalesce($9, last_name),
            version = version + 1
          WHERE account_id = $1 AND id = $2 AND version = $3
          RETURNING *`,
        [
          accountId,
          userId,
          expectedVersion,
          patch.role ?? null,
          patch.status ?? null,
          'siteScope' in patch,
          patch.siteScope ?? null,
          patch.firstName ?? null,
          patch.lastName ?? null
        ]
      );
      if (!row) {
        throw new ConflictError('The user was modified by someone else; reload and try again', {
          expectedVersion
        });
      }
      return toUser(row);
    }
  };
}

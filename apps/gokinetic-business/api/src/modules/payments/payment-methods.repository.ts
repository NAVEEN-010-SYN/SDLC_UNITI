import { Db } from '../../db/query';
import { CardBrand, PaymentMethod, PaymentMethodKind } from './payment-methods.types';

interface PaymentMethodRow {
  id: string;
  account_id: string;
  kind: PaymentMethodKind;
  holder_name: string;
  card_brand: CardBrand | null;
  last4: string;
  expiry_month: number | null;
  expiry_year: number | null;
  sort_code_masked: string | null;
  is_default: boolean;
  created_at: Date;
}

export interface NewPaymentMethod {
  accountId: string;
  kind: PaymentMethodKind;
  providerRef: string;
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdBy: string;
}

const COLUMNS = 'id, account_id, kind, holder_name, card_brand, last4, expiry_month, expiry_year, sort_code_masked, is_default, created_at';

function toPaymentMethod(r: PaymentMethodRow): PaymentMethod {
  return {
    id: r.id,
    accountId: r.account_id,
    kind: r.kind,
    holderName: r.holder_name,
    cardBrand: r.card_brand,
    last4: r.last4,
    expiryMonth: r.expiry_month,
    expiryYear: r.expiry_year,
    sortCodeMasked: r.sort_code_masked,
    isDefault: r.is_default,
    createdAt: r.created_at.toISOString()
  };
}

export interface PaymentMethodsRepository {
  listActive(accountId: string, db?: Db): Promise<PaymentMethod[]>;
  /** Locks the account's active methods so default changes are serialised. */
  lockActive(accountId: string, db: Db): Promise<PaymentMethod[]>;
  insert(method: NewPaymentMethod, db: Db): Promise<PaymentMethod>;
  clearDefault(accountId: string, db: Db): Promise<void>;
  setDefault(accountId: string, id: string, db: Db): Promise<void>;
  /** Returns the provider reference so the caller can revoke it with the gateway. */
  markRemoved(accountId: string, id: string, at: Date, db: Db): Promise<string>;
}

export function createPaymentMethodsRepository(defaultDb: Db): PaymentMethodsRepository {
  return {
    async listActive(accountId, db = defaultDb) {
      const rows = await db.many<PaymentMethodRow>(
        `SELECT ${COLUMNS} FROM payment_methods WHERE account_id = $1 AND status = 'ACTIVE' ORDER BY is_default DESC, created_at`,
        [accountId]
      );
      return rows.map(toPaymentMethod);
    },

    async lockActive(accountId, db) {
      const rows = await db.many<PaymentMethodRow>(
        `SELECT ${COLUMNS} FROM payment_methods WHERE account_id = $1 AND status = 'ACTIVE' ORDER BY created_at FOR UPDATE`,
        [accountId]
      );
      return rows.map(toPaymentMethod);
    },

    async insert(m, db) {
      const row = await db.one<PaymentMethodRow>(
        `INSERT INTO payment_methods (account_id, kind, provider_ref, holder_name, card_brand, last4, expiry_month, expiry_year,
                                      sort_code_masked, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
        [m.accountId, m.kind, m.providerRef, m.holderName, m.cardBrand, m.last4, m.expiryMonth, m.expiryYear, m.sortCodeMasked, m.isDefault, m.createdBy]
      );
      return toPaymentMethod(row);
    },

    async clearDefault(accountId, db) {
      await db.exec(`UPDATE payment_methods SET is_default = false WHERE account_id = $1 AND is_default AND status = 'ACTIVE'`, [accountId]);
    },

    async setDefault(accountId, id, db) {
      // Clear first: the partial unique index allows only one default per account.
      await this.clearDefault(accountId, db);
      await db.exec(`UPDATE payment_methods SET is_default = true WHERE account_id = $1 AND id = $2 AND status = 'ACTIVE'`, [accountId, id]);
    },

    async markRemoved(accountId, id, at, db) {
      const row = await db.one<{ provider_ref: string }>(
        `UPDATE payment_methods SET status = 'REMOVED', is_default = false, removed_at = $3
          WHERE account_id = $1 AND id = $2 AND status = 'ACTIVE'
          RETURNING provider_ref`,
        [accountId, id, at]
      );
      return row.provider_ref;
    }
  };
}

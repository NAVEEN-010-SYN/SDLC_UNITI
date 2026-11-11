export const PAYMENT_METHOD_KINDS = ['CARD', 'DIRECT_DEBIT'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const CARD_BRANDS = ['VISA', 'MASTERCARD', 'AMEX'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export interface PaymentMethod {
  id: string;
  accountId: string;
  kind: PaymentMethodKind;
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface PaymentMethodView extends PaymentMethod {
  expired: boolean;
  expiresSoon: boolean;
}

/** Card details arrive already tokenised by the payment provider's hosted fields. */
export interface AddCardInput {
  kind: 'CARD';
  providerToken: string;
  holderName: string;
  cardBrand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  makeDefault: boolean;
}

/** Bank details are forwarded once to the gateway to create a mandate and are never stored. */
export interface AddDirectDebitInput {
  kind: 'DIRECT_DEBIT';
  holderName: string;
  sortCode: string;
  accountNumber: string;
  makeDefault: boolean;
}

export type AddPaymentMethodInput = AddCardInput | AddDirectDebitInput;

export const MAX_ACTIVE_PAYMENT_METHODS = 5;
/** Cards expiring within this many days are flagged in the portal. */
export const EXPIRY_WARNING_DAYS = 60;

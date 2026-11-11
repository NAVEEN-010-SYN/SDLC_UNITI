-- Payment methods (tokenised; no PAN or full bank account number is ever stored)
CREATE TABLE payment_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  kind            text NOT NULL CHECK (kind IN ('CARD', 'DIRECT_DEBIT')),
  provider_ref    text NOT NULL,
  holder_name     text NOT NULL,
  card_brand      text CHECK (card_brand IN ('VISA', 'MASTERCARD', 'AMEX')),
  last4           char(4) NOT NULL,
  expiry_month    smallint CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year     smallint,
  sort_code_masked text,
  is_default      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,
  CHECK (kind <> 'CARD' OR (card_brand IS NOT NULL AND expiry_month IS NOT NULL AND expiry_year IS NOT NULL)),
  CHECK (kind <> 'DIRECT_DEBIT' OR sort_code_masked IS NOT NULL)
);
CREATE INDEX idx_payment_methods_account ON payment_methods(account_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_payment_methods_default ON payment_methods(account_id) WHERE is_default AND status = 'ACTIVE';
CREATE UNIQUE INDEX uq_payment_methods_provider_ref ON payment_methods(provider_ref) WHERE status = 'ACTIVE';

-- Transactional outbox for customer notifications (invitations, ticket updates).
-- A separate relay delivers rows and marks them SENT, so a mail outage never rolls back business writes.
CREATE TABLE notification_outbox (
  id              bigserial PRIMARY KEY,
  account_id      text NOT NULL,
  kind            text NOT NULL,
  recipient       text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts        int NOT NULL DEFAULT 0,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX idx_outbox_pending ON notification_outbox(created_at) WHERE status = 'PENDING';

CREATE INDEX idx_audit_account_entity ON audit_log(account_id, entity, created_at DESC);
CREATE INDEX idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);

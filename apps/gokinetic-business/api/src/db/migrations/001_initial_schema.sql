-- Go Kinetic Business self-care: initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts (
  id              text PRIMARY KEY CHECK (id ~ '^ACC-[0-9]{8}$'),
  name            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  currency        char(3) NOT NULL DEFAULT 'GBP',
  sla_tier        text NOT NULL DEFAULT 'STANDARD' CHECK (sla_tier IN ('STANDARD', 'ENHANCED', 'PREMIUM')),
  approval_threshold_minor bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cost_centres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  code            text NOT NULL,
  name            text NOT NULL,
  monthly_budget_minor bigint,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);

CREATE TABLE sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  code            text NOT NULL,
  name            text NOT NULL,
  address_line1   text NOT NULL,
  address_line2   text,
  city            text NOT NULL,
  postcode        text NOT NULL,
  country         char(2) NOT NULL DEFAULT 'GB',
  status          text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'DECOMMISSIONED')),
  cost_centre_id  uuid REFERENCES cost_centres(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);
CREATE INDEX idx_sites_account ON sites(account_id);

CREATE TABLE contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  term_months     int NOT NULL CHECK (term_months IN (12, 24, 36, 60)),
  start_date      timestamptz NOT NULL,
  end_date        timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('ACTIVE', 'RENEWED', 'EXPIRED', 'TERMINATED')),
  monthly_commit_minor bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  auto_renew      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_account ON contracts(account_id);

CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  site_id         uuid NOT NULL REFERENCES sites(id),
  contract_id     uuid REFERENCES contracts(id),
  cost_centre_id  uuid REFERENCES cost_centres(id),
  product_code    text NOT NULL,
  product_name    text NOT NULL,
  category        text NOT NULL CHECK (category IN ('BROADBAND', 'VOICE', 'SDWAN', 'HOSTED')),
  bandwidth_mbps  int,
  status          text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'CEASED')),
  sla_tier        text NOT NULL DEFAULT 'STANDARD',
  monthly_charge_minor bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  activated_at    timestamptz,
  ceased_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_account_site ON services(account_id, site_id);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  email           text NOT NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  role            text NOT NULL CHECK (role IN ('BUSINESS_ADMIN', 'BUSINESS_USER')),
  status          text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  site_scope      uuid[],
  invited_by      uuid,
  last_login_at   timestamptz,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, email)
);

CREATE TABLE order_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  created_by      uuid NOT NULL,
  item_count      int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  batch_id        uuid REFERENCES order_batches(id),
  reference       text NOT NULL UNIQUE,
  order_type      text NOT NULL CHECK (order_type IN ('PROVIDE', 'MOVE', 'ADD', 'CHANGE', 'CEASE')),
  status          text NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED')),
  site_id         uuid NOT NULL REFERENCES sites(id),
  target_site_id  uuid REFERENCES sites(id),
  service_id      uuid REFERENCES services(id),
  product_code    text,
  bandwidth_mbps  int,
  monthly_delta_minor bigint NOT NULL DEFAULT 0,
  one_off_charge_minor bigint NOT NULL DEFAULT 0,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by     uuid,
  requested_date  date,
  notes           text,
  failure_reason  text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_account_status ON orders(account_id, status);

CREATE TABLE order_status_history (
  id              bigserial PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES orders(id),
  from_status     text,
  to_status       text NOT NULL,
  changed_by      uuid,
  reason          text,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  number          text NOT NULL UNIQUE,
  period          char(7) NOT NULL,
  issue_date      timestamptz NOT NULL,
  due_date        timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('ISSUED', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID')),
  subtotal_minor  bigint NOT NULL,
  tax_minor       bigint NOT NULL,
  total_minor     bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  UNIQUE (account_id, period)
);

CREATE TABLE invoice_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  service_id      uuid REFERENCES services(id),
  site_id         uuid REFERENCES sites(id),
  description     text NOT NULL,
  category        text NOT NULL,
  amount_minor    bigint NOT NULL,
  cost_centre_id  uuid REFERENCES cost_centres(id)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE cost_centre_split_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  site_id         uuid NOT NULL REFERENCES sites(id),
  cost_centre_id  uuid NOT NULL REFERENCES cost_centres(id),
  share_bps       int NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000),
  UNIQUE (site_id, cost_centre_id)
);

CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  category        text NOT NULL CHECK (category IN ('FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL')),
  priority        text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
  status          text NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED')),
  service_id      uuid REFERENCES services(id),
  site_id         uuid REFERENCES sites(id),
  subject         text NOT NULL,
  description     text NOT NULL,
  raised_by       uuid NOT NULL,
  contact_phone   text,
  escalation_level int NOT NULL DEFAULT 0,
  sla_tier        text NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  pending_since   timestamptz,
  paused_ms       bigint NOT NULL DEFAULT 0,
  response_due_at timestamptz NOT NULL,
  resolution_due_at timestamptz NOT NULL,
  version         int NOT NULL DEFAULT 1
);
CREATE INDEX idx_tickets_account_status ON tickets(account_id, status);

CREATE TABLE ticket_events (
  id              bigserial PRIMARY KEY,
  ticket_id       uuid NOT NULL REFERENCES tickets(id),
  kind            text NOT NULL CHECK (kind IN ('COMMENT', 'STATUS_CHANGE', 'ESCALATION', 'PRIORITY_CHANGE')),
  author_id       uuid,
  body            text,
  from_value      text,
  to_value        text,
  internal        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_outages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES services(id),
  ticket_id       uuid REFERENCES tickets(id),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  planned         boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_outages_service_time ON service_outages(service_id, started_at);

CREATE TABLE contract_renewal_quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id),
  term_months     int NOT NULL,
  discount_bps    int NOT NULL,
  monthly_commit_minor bigint NOT NULL,
  status          text NOT NULL CHECK (status IN ('QUOTED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED')),
  valid_until     timestamptz NOT NULL,
  accepted_by     uuid,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  kind            text NOT NULL CHECK (kind IN ('INVOICE', 'CONTRACT', 'SLA_REPORT', 'ORDER_FORM', 'SERVICE_SCHEDULE')),
  title           text NOT NULL,
  storage_key     text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL,
  site_id         uuid REFERENCES sites(id),
  related_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_account_kind ON documents(account_id, kind);

CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  account_id      text NOT NULL,
  actor_id        uuid,
  action          text NOT NULL,
  entity          text NOT NULL,
  entity_id       text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_account_time ON audit_log(account_id, created_at DESC);

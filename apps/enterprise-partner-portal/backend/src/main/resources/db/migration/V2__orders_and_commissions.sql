-- Orders placed from accepted quotes, per-site provisioning tracking, and the commission
-- ledger with monthly statements and payouts.

CREATE TABLE partner_order (
    id                      uuid PRIMARY KEY,
    reference               varchar(20)  NOT NULL UNIQUE,
    partner_id              uuid         NOT NULL REFERENCES partner (id),
    quote_id                uuid         NOT NULL UNIQUE REFERENCES quote (id),
    quote_reference         varchar(20)  NOT NULL,
    deal_id                 uuid REFERENCES deal_registration (id),
    customer_name           varchar(200) NOT NULL,
    customer_account_id     varchar(12)  NOT NULL,
    new_logo                boolean      NOT NULL,
    customer_contact_email  varchar(200) NOT NULL,
    purchase_order_number   varchar(40),
    term_months             integer      NOT NULL,
    currency                varchar(3)   NOT NULL,
    monthly_recurring_minor bigint       NOT NULL,
    one_off_minor           bigint       NOT NULL,
    status                  varchar(20)  NOT NULL,
    requested_by            varchar(120) NOT NULL,
    requested_install_date  date,
    submitted_at            timestamptz,
    activated_at            timestamptz,
    ceased_at               timestamptz,
    status_reason           varchar(500),
    created_at              timestamptz  NOT NULL,
    updated_at              timestamptz  NOT NULL,
    created_by              varchar(120),
    updated_by              varchar(120),
    version                 bigint       NOT NULL DEFAULT 0
);
CREATE INDEX ix_order_partner_status ON partner_order (partner_id, status);
CREATE INDEX ix_order_partner_activated ON partner_order (partner_id, activated_at) WHERE status = 'ACTIVE';
CREATE INDEX ix_order_account ON partner_order (customer_account_id);

CREATE TABLE order_site (
    id                  uuid PRIMARY KEY,
    order_id            uuid         NOT NULL REFERENCES partner_order (id) ON DELETE CASCADE,
    site_no             integer      NOT NULL,
    site_name           varchar(120) NOT NULL,
    site_postcode       varchar(10)  NOT NULL,
    sku                 varchar(40)  NOT NULL,
    product_name        varchar(120) NOT NULL,
    product_category    varchar(20)  NOT NULL,
    quantity            integer      NOT NULL,
    net_mrc_minor       bigint       NOT NULL,
    stage               varchar(20)  NOT NULL,
    blocked_from_stage  varchar(20),
    engineer_visit_date date,
    service_id          varchar(40),
    stage_updated_at    timestamptz,
    blocker_note        varchar(500),
    CONSTRAINT ux_order_site_no UNIQUE (order_id, site_no)
);

CREATE TABLE order_event (
    id          uuid PRIMARY KEY,
    order_id    uuid         NOT NULL REFERENCES partner_order (id) ON DELETE CASCADE,
    type        varchar(20)  NOT NULL,
    actor       varchar(120) NOT NULL,
    detail      varchar(500) NOT NULL,
    occurred_at timestamptz  NOT NULL
);
CREATE INDEX ix_order_event_order ON order_event (order_id, occurred_at);

CREATE TABLE commission_rule (
    id               uuid PRIMARY KEY,
    name             varchar(80) NOT NULL,
    product_category varchar(20),
    min_tier         varchar(20),
    min_term_months  integer     NOT NULL DEFAULT 0,
    rate_bps         integer     NOT NULL CHECK (rate_bps >= 0),
    flat_bonus_minor bigint      NOT NULL CHECK (flat_bonus_minor >= 0),
    currency         varchar(3)  NOT NULL,
    valid_from       date        NOT NULL,
    valid_to         date,
    active           boolean     NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL,
    created_by       varchar(120),
    updated_by       varchar(120),
    version          bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ck_commission_rule_window CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX ix_commission_rule_effective ON commission_rule (valid_from, valid_to) WHERE active;

CREATE TABLE commission_statement (
    id                        uuid PRIMARY KEY,
    reference                 varchar(20) NOT NULL UNIQUE,
    partner_id                uuid        NOT NULL REFERENCES partner (id),
    period_start              date        NOT NULL,
    period_end                date        NOT NULL,
    currency                  varchar(3)  NOT NULL,
    status                    varchar(20) NOT NULL,
    accrued_minor             bigint      NOT NULL,
    clawback_minor            bigint      NOT NULL,
    adjustment_minor          bigint      NOT NULL,
    brought_forward_minor     bigint      NOT NULL,
    net_payable_minor         bigint      NOT NULL,
    issued_at                 timestamptz,
    dispute_reason            varchar(1000),
    disputed_at               timestamptz,
    decided_by                varchar(120),
    decided_at                timestamptz,
    paid_at                   timestamptz,
    carried_into_statement_id uuid REFERENCES commission_statement (id),
    created_at                timestamptz NOT NULL,
    updated_at                timestamptz NOT NULL,
    created_by                varchar(120),
    updated_by                varchar(120),
    version                   bigint      NOT NULL DEFAULT 0,
    CONSTRAINT ux_statement_period UNIQUE (partner_id, period_start)
);
CREATE INDEX ix_statement_status ON commission_statement (status);

CREATE TABLE commission_entry (
    id              uuid PRIMARY KEY,
    partner_id      uuid         NOT NULL REFERENCES partner (id),
    order_id        uuid REFERENCES partner_order (id),
    order_reference varchar(20),
    type            varchar(20)  NOT NULL,
    component       varchar(40)  NOT NULL,
    description     varchar(300) NOT NULL,
    amount_minor    bigint       NOT NULL,
    currency        varchar(3)   NOT NULL,
    earned_on       date         NOT NULL,
    statement_id    uuid REFERENCES commission_statement (id),
    created_at      timestamptz  NOT NULL,
    created_by      varchar(120) NOT NULL
);
CREATE INDEX ix_commission_entry_unbilled ON commission_entry (partner_id, earned_on) WHERE statement_id IS NULL;
CREATE INDEX ix_commission_entry_order ON commission_entry (order_id, type);
CREATE INDEX ix_commission_entry_statement ON commission_entry (statement_id);

CREATE TABLE commission_payout (
    id                uuid PRIMARY KEY,
    statement_id      uuid        NOT NULL UNIQUE REFERENCES commission_statement (id),
    partner_id        uuid        NOT NULL REFERENCES partner (id),
    amount_minor      bigint      NOT NULL CHECK (amount_minor > 0),
    currency          varchar(3)  NOT NULL,
    status            varchar(20) NOT NULL,
    scheduled_for     date        NOT NULL,
    payment_reference varchar(40),
    paid_at           timestamptz,
    failure_reason    varchar(500),
    created_at        timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL,
    created_by        varchar(120),
    updated_by        varchar(120),
    version           bigint      NOT NULL DEFAULT 0
);
CREATE INDEX ix_payout_partner_status ON commission_payout (partner_id, status);

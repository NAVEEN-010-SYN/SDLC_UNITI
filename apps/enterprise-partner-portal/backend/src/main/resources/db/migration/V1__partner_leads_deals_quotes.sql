-- Core partner programme schema: partners & KYC, portal users, leads, deal registrations,
-- catalog and quotes. Money columns are integer minor units; timestamps are UTC (timestamptz).

CREATE SEQUENCE partner_ref_seq START 1;
CREATE SEQUENCE lead_ref_seq START 1;
CREATE SEQUENCE deal_ref_seq START 1;
CREATE SEQUENCE quote_ref_seq START 1;
CREATE SEQUENCE order_ref_seq START 1;
CREATE SEQUENCE statement_ref_seq START 1;
CREATE SEQUENCE mdf_claim_ref_seq START 1;
CREATE SEQUENCE case_ref_seq START 1;
CREATE SEQUENCE account_ref_seq START 50000000;

CREATE TABLE partner (
    id                     uuid PRIMARY KEY,
    reference              varchar(20)  NOT NULL UNIQUE,
    legal_name             varchar(200) NOT NULL,
    trading_name           varchar(200),
    company_number         varchar(20)  NOT NULL,
    vat_number             varchar(20),
    website                varchar(200),
    contact_name           varchar(120) NOT NULL,
    contact_email          varchar(200) NOT NULL,
    contact_phone          varchar(30),
    address_line1          varchar(200) NOT NULL,
    address_line2          varchar(200),
    city                   varchar(100) NOT NULL,
    postcode               varchar(10)  NOT NULL,
    country_code           varchar(2)   NOT NULL,
    status                 varchar(20)  NOT NULL,
    tier                   varchar(20)  NOT NULL,
    currency               varchar(3)   NOT NULL,
    trailing_revenue_minor bigint       NOT NULL DEFAULT 0,
    tier_evaluated_at      timestamptz,
    activated_at           timestamptz,
    status_reason          varchar(500),
    channel_manager_id     varchar(120),
    created_at             timestamptz  NOT NULL,
    updated_at             timestamptz  NOT NULL,
    created_by             varchar(120),
    updated_by             varchar(120),
    version                bigint       NOT NULL DEFAULT 0
);
CREATE INDEX ix_partner_company_number ON partner (upper(company_number));
CREATE INDEX ix_partner_status_tier ON partner (status, tier);

CREATE TABLE kyc_document (
    id               uuid PRIMARY KEY,
    partner_id       uuid         NOT NULL REFERENCES partner (id),
    type             varchar(40)  NOT NULL,
    file_name        varchar(255) NOT NULL,
    storage_key      varchar(500) NOT NULL,
    sha256           varchar(64)  NOT NULL,
    issued_on        date,
    status           varchar(20)  NOT NULL,
    uploaded_at      timestamptz  NOT NULL,
    uploaded_by      varchar(120) NOT NULL,
    reviewed_at      timestamptz,
    reviewed_by      varchar(120),
    rejection_reason varchar(500)
);
CREATE INDEX ix_kyc_document_partner ON kyc_document (partner_id, type);

CREATE TABLE partner_user (
    id                uuid PRIMARY KEY,
    partner_id        uuid         NOT NULL REFERENCES partner (id),
    email             varchar(200) NOT NULL,
    first_name        varchar(80)  NOT NULL,
    last_name         varchar(80)  NOT NULL,
    role              varchar(20)  NOT NULL,
    status            varchar(20)  NOT NULL,
    idp_subject       varchar(120) UNIQUE,
    certified_until   date,
    invited_at        timestamptz  NOT NULL,
    invite_expires_at timestamptz  NOT NULL,
    last_login_at     timestamptz,
    deactivated_at    timestamptz,
    created_at        timestamptz  NOT NULL,
    updated_at        timestamptz  NOT NULL,
    created_by        varchar(120),
    updated_by        varchar(120),
    version           bigint       NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_partner_user_email ON partner_user (partner_id, lower(email));

CREATE TABLE partner_lead (
    id                  uuid PRIMARY KEY,
    reference           varchar(20)  NOT NULL UNIQUE,
    partner_id          uuid         NOT NULL REFERENCES partner (id),
    owner_subject       varchar(120) NOT NULL,
    company_name        varchar(200) NOT NULL,
    contact_name        varchar(120) NOT NULL,
    contact_email       varchar(200) NOT NULL,
    contact_phone       varchar(30),
    postcode            varchar(10)  NOT NULL,
    site_count          integer      NOT NULL,
    estimated_mrc_minor bigint       NOT NULL,
    product_interest    varchar(200),
    source              varchar(20)  NOT NULL,
    status              varchar(20)  NOT NULL,
    score               integer      NOT NULL,
    notes               varchar(2000),
    next_action_at      timestamptz,
    disqualify_reason   varchar(300),
    converted_deal_id   uuid,
    created_at          timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL,
    created_by          varchar(120),
    updated_by          varchar(120),
    version             bigint       NOT NULL DEFAULT 0
);
CREATE INDEX ix_lead_partner_status ON partner_lead (partner_id, status);
CREATE INDEX ix_lead_partner_owner ON partner_lead (partner_id, owner_subject);
CREATE INDEX ix_lead_next_action ON partner_lead (partner_id, next_action_at) WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED');

CREATE TABLE deal_registration (
    id                      uuid PRIMARY KEY,
    reference               varchar(20)  NOT NULL UNIQUE,
    partner_id              uuid         NOT NULL REFERENCES partner (id),
    lead_id                 uuid REFERENCES partner_lead (id),
    registered_by           varchar(120) NOT NULL,
    customer_name           varchar(200) NOT NULL,
    normalised_name         varchar(200) NOT NULL,
    customer_company_number varchar(20),
    customer_domain         varchar(200),
    customer_postcode       varchar(10)  NOT NULL,
    outward_code            varchar(6)   NOT NULL,
    contact_name            varchar(120) NOT NULL,
    contact_email           varchar(200) NOT NULL,
    site_count              integer      NOT NULL,
    estimated_mrc_minor     bigint       NOT NULL,
    currency                varchar(3)   NOT NULL,
    expected_close_date     date         NOT NULL,
    product_interest        varchar(200) NOT NULL,
    status                  varchar(20)  NOT NULL,
    has_conflict            boolean      NOT NULL DEFAULT false,
    submitted_at            timestamptz  NOT NULL,
    decided_at              timestamptz,
    decided_by              varchar(120),
    decision_reason         varchar(500),
    protected_until         date,
    extensions_used         integer      NOT NULL DEFAULT 0,
    created_at              timestamptz  NOT NULL,
    updated_at              timestamptz  NOT NULL,
    created_by              varchar(120),
    updated_by              varchar(120),
    version                 bigint       NOT NULL DEFAULT 0
);
CREATE INDEX ix_deal_partner_status ON deal_registration (partner_id, status);
CREATE INDEX ix_deal_conflict_outward ON deal_registration (outward_code) WHERE status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED');
CREATE INDEX ix_deal_conflict_domain ON deal_registration (customer_domain) WHERE customer_domain IS NOT NULL;
CREATE INDEX ix_deal_conflict_company ON deal_registration (customer_company_number) WHERE customer_company_number IS NOT NULL;
CREATE INDEX ix_deal_conflict_name ON deal_registration (normalised_name);
CREATE INDEX ix_deal_protected_until ON deal_registration (protected_until) WHERE status = 'APPROVED';

CREATE TABLE deal_conflict (
    id                     uuid PRIMARY KEY,
    deal_id                uuid         NOT NULL REFERENCES deal_registration (id),
    conflicting_deal_id    uuid         NOT NULL,
    conflicting_partner_id uuid         NOT NULL,
    conflicting_reference  varchar(20)  NOT NULL,
    match_reasons          varchar(300) NOT NULL,
    score                  integer      NOT NULL,
    detected_at            timestamptz  NOT NULL
);
CREATE INDEX ix_deal_conflict_deal ON deal_conflict (deal_id);

CREATE TABLE catalog_product (
    id                        uuid PRIMARY KEY,
    sku                       varchar(40)  NOT NULL UNIQUE,
    name                      varchar(120) NOT NULL,
    category                  varchar(20)  NOT NULL,
    bandwidth_mbps            integer,
    monthly_price_minor       bigint       NOT NULL CHECK (monthly_price_minor >= 0),
    install_price_minor       bigint       NOT NULL CHECK (install_price_minor >= 0),
    floor_monthly_price_minor bigint       NOT NULL CHECK (floor_monthly_price_minor >= 0),
    min_term_months           integer      NOT NULL,
    per_site                  boolean      NOT NULL,
    currency                  varchar(3)   NOT NULL,
    active                    boolean      NOT NULL DEFAULT true,
    CONSTRAINT ck_catalog_floor CHECK (floor_monthly_price_minor <= monthly_price_minor)
);

CREATE TABLE quote (
    id                          uuid PRIMARY KEY,
    reference                   varchar(20)   NOT NULL UNIQUE,
    partner_id                  uuid          NOT NULL REFERENCES partner (id),
    deal_id                     uuid REFERENCES deal_registration (id),
    customer_name               varchar(200)  NOT NULL,
    customer_account_id         varchar(12),
    customer_contact_email      varchar(200)  NOT NULL,
    term_months                 integer       NOT NULL,
    currency                    varchar(3)    NOT NULL,
    status                      varchar(20)   NOT NULL,
    revision                    integer       NOT NULL,
    requested_discount_percent  numeric(6, 3) NOT NULL,
    effective_discount_percent  numeric(6, 3) NOT NULL,
    list_mrc_minor              bigint        NOT NULL,
    term_discount_minor         bigint        NOT NULL,
    volume_discount_minor       bigint        NOT NULL,
    partner_discount_minor      bigint        NOT NULL,
    net_mrc_minor               bigint        NOT NULL,
    nrc_minor                   bigint        NOT NULL,
    nrc_waived                  boolean       NOT NULL,
    total_contract_value_minor  bigint        NOT NULL,
    approval_level              varchar(20)   NOT NULL,
    justification               varchar(1000),
    valid_until                 timestamptz,
    sent_at                     timestamptz,
    accepted_at                 timestamptz,
    closed_reason               varchar(500),
    created_at                  timestamptz   NOT NULL,
    updated_at                  timestamptz   NOT NULL,
    created_by                  varchar(120),
    updated_by                  varchar(120),
    version                     bigint        NOT NULL DEFAULT 0
);
CREATE INDEX ix_quote_partner_status ON quote (partner_id, status);
CREATE INDEX ix_quote_deal ON quote (deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX ix_quote_valid_until ON quote (valid_until) WHERE status IN ('APPROVED', 'SENT');

CREATE TABLE quote_line (
    id                   uuid PRIMARY KEY,
    quote_id             uuid         NOT NULL REFERENCES quote (id) ON DELETE CASCADE,
    line_no              integer      NOT NULL,
    sku                  varchar(40)  NOT NULL,
    product_name         varchar(120) NOT NULL,
    site_name            varchar(120) NOT NULL,
    site_postcode        varchar(10)  NOT NULL,
    quantity             integer      NOT NULL CHECK (quantity > 0),
    unit_mrc_minor       bigint       NOT NULL,
    unit_nrc_minor       bigint       NOT NULL,
    unit_floor_mrc_minor bigint       NOT NULL,
    net_mrc_minor        bigint       NOT NULL,
    CONSTRAINT ux_quote_line_no UNIQUE (quote_id, line_no)
);

CREATE TABLE quote_approval (
    id               uuid PRIMARY KEY,
    quote_id         uuid          NOT NULL REFERENCES quote (id) ON DELETE CASCADE,
    revision         integer       NOT NULL,
    approver         varchar(120)  NOT NULL,
    decision         varchar(10)   NOT NULL,
    discount_percent numeric(6, 3) NOT NULL,
    note             varchar(500),
    decided_at       timestamptz   NOT NULL,
    CONSTRAINT ux_quote_approval_once UNIQUE (quote_id, revision, approver)
);

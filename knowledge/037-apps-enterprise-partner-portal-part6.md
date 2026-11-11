# Enterprise Partner Portal: apps/enterprise-partner-portal (part 6 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 22

## Files

- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/dto/UserDtos.java` (53 lines)
- `apps/enterprise-partner-portal/backend/src/main/resources/application.yml` (91 lines)
- `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V1__partner_leads_deals_quotes.sql` (249 lines)
- `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V2__orders_and_commissions.sql` (154 lines)
- `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V3__seed_channel_catalog.sql` (19 lines)
- `apps/enterprise-partner-portal/backend/src/main/resources/logback-spring.xml` (28 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/TestFixtures.java` (60 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionCalculatorTest.java` (77 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionServiceTest.java` (209 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/dashboard/PipelineKpisTest.java` (21 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/orders/OrderServiceTest.java` (184 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuotePricingEngineTest.java` (107 lines)
- `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuoteServiceTest.java` (183 lines)
- `apps/enterprise-partner-portal/frontend/.env.example` (10 lines)
- `apps/enterprise-partner-portal/frontend/index.html` (13 lines)
- `apps/enterprise-partner-portal/frontend/package.json` (32 lines)
- `apps/enterprise-partner-portal/frontend/src/App.tsx` (79 lines)
- `apps/enterprise-partner-portal/frontend/src/api/ApiContext.tsx` (30 lines)
- `apps/enterprise-partner-portal/frontend/src/api/client.test.ts` (96 lines)
- `apps/enterprise-partner-portal/frontend/src/api/client.ts` (77 lines)
- `apps/enterprise-partner-portal/frontend/src/api/endpoints.ts` (74 lines)
- `apps/enterprise-partner-portal/frontend/src/api/problem.ts` (80 lines)

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/dto/UserDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/dto/UserDtos.java`.

```java
package com.uniti.partnerportal.users.dto;

import com.uniti.partnerportal.users.PartnerUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {
    }

    public record InviteUserRequest(
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull PartnerUser.Role role) {
    }

    public record UpdateUserRequest(
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull PartnerUser.Role role) {
    }

    public record CertificationRequest(@NotNull @Future LocalDate certifiedUntil) {
    }

    public record PartnerUserResponse(
            UUID id,
            UUID partnerId,
            String email,
            String firstName,
            String lastName,
            PartnerUser.Role role,
            PartnerUser.Status status,
            boolean certified,
            LocalDate certifiedUntil,
            Instant invitedAt,
            Instant inviteExpiresAt,
            Instant lastLoginAt) {
    }

    public record SeatUsage(int seatLimit, long seatsUsed, long seatsAvailable) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/resources/application.yml

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: yaml. Path: `apps/enterprise-partner-portal/backend/src/main/resources/application.yml`.

```yaml
server:
  port: ${PORT:8080}
  shutdown: graceful
  error:
    include-stacktrace: never

spring:
  application:
    name: enterprise-partner-portal
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/partner_portal}
    username: ${DB_USERNAME:partner_portal}
    password: ${DB_PASSWORD:}
    hikari:
      maximum-pool-size: ${DB_POOL_SIZE:10}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        jdbc.time_zone: UTC
        format_sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration
  jackson:
    serialization:
      write-dates-as-timestamps: false
    time-zone: UTC
    default-property-inclusion: non_null
  mvc:
    problemdetails:
      enabled: true
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${OIDC_ISSUER_URI:https://login.uniti.example/realms/partners}
          audiences: ${OIDC_AUDIENCE:enterprise-partner-portal}

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true

springdoc:
  api-docs:
    path: /api/v1/openapi
  swagger-ui:
    path: /api/v1/docs

partner-portal:
  security:
    roles-claim: ${JWT_ROLES_CLAIM:roles}
    partner-claim: ${JWT_PARTNER_CLAIM:partner_id}
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173}
  pricing:
    default-currency: GBP
    quote-validity-days: 30
    max-discount-percent: 40
  deals:
    protection-days: 90
    extension-days: 30
    max-extensions: 1
    name-similarity-threshold: 0.85
  commissions:
    clawback-window-days: 90
    deal-registration-uplift-bps: 200
    new-logo-bonus-minor: 25000
  mdf:
    claim-window-days: 60
    co-op-share-percent: 50
  cases:
    first-response-hours:
      P1: 1
      P2: 4
      P3: 8
      P4: 24
    resolution-hours:
      P1: 8
      P2: 24
      P3: 72
      P4: 120
```

## apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V1__partner_leads_deals_quotes.sql

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: sql. Path: `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V1__partner_leads_deals_quotes.sql`.

```sql
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
```

## apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V2__orders_and_commissions.sql

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: sql. Path: `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V2__orders_and_commissions.sql`.

```sql
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
```

## apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V3__seed_channel_catalog.sql

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: sql. Path: `apps/enterprise-partner-portal/backend/src/main/resources/db/migration/V3__seed_channel_catalog.sql`.

```sql
-- Channel price list (GBP, minor units). Floor prices are the lowest net monthly price Uniti
-- accepts after all discounts.

INSERT INTO catalog_product (id, sku, name, category, bandwidth_mbps, monthly_price_minor, install_price_minor,
                             floor_monthly_price_minor, min_term_months, per_site, currency, active)
VALUES
    (gen_random_uuid(), 'FBB-BUS-100',  'Business Fibre 100 Mbps',      'BROADBAND', 100,  3500,  9900,  2600, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-500',  'Business Fibre 500 Mbps',      'BROADBAND', 500,  5500,  9900,  4000, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-1000', 'Business Fibre 1 Gbps',        'BROADBAND', 1000, 7900,  9900,  5800, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-2000', 'Business Fibre 2 Gbps',        'BROADBAND', 2000, 12900, 14900, 9500, 24, true,  'GBP', true),
    (gen_random_uuid(), 'VOI-SIP-CH',   'Hosted SIP channel',           'VOICE',     NULL, 450,   0,     320,  12, false, 'GBP', true),
    (gen_random_uuid(), 'VOI-HV-SEAT',  'Hosted Voice seat',            'VOICE',     NULL, 1200,  1500,  850,  12, false, 'GBP', true),
    (gen_random_uuid(), 'SDW-VC-EDGE',  'SD-WAN Edge (VeloCloud)',      'SDWAN',     NULL, 18500, 25000, 14000, 36, true, 'GBP', true),
    (gen_random_uuid(), 'SDW-FG-EDGE',  'SD-WAN Edge (Fortinet)',       'SDWAN',     NULL, 16500, 25000, 12500, 36, true, 'GBP', true),
    (gen_random_uuid(), 'HST-EMAIL',    'Hosted email mailbox',         'HOSTED',    NULL, 400,   0,     280,  12, false, 'GBP', true),
    (gen_random_uuid(), 'HST-WEB-PRO',  'Managed web hosting (Pro)',    'HOSTED',    NULL, 2500,  5000,  1800, 12, true,  'GBP', true),
    (gen_random_uuid(), 'ADD-STATIC-8', 'Static IPv4 block (/29)',      'ADD_ON',    NULL, 1000,  0,     700,  12, true,  'GBP', true),
    (gen_random_uuid(), 'ADD-4G-BKP',   '4G backup with failover',      'ADD_ON',    NULL, 2000,  4900,  1400, 12, true,  'GBP', true);
```

## apps/enterprise-partner-portal/backend/src/main/resources/logback-spring.xml

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: xml. Path: `apps/enterprise-partner-portal/backend/src/main/resources/logback-spring.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <springProfile name="local">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{HH:mm:ss.SSS} %-5level [%X{correlationId:-}] %logger{36} - %msg%n</pattern>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>

    <springProfile name="!local">
        <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>correlationId</includeMdcKeyName>
                <includeMdcKeyName>partnerId</includeMdcKeyName>
                <includeMdcKeyName>userId</includeMdcKeyName>
                <customFields>{"service":"enterprise-partner-portal"}</customFields>
            </encoder>
        </appender>
        <root level="INFO">
            <appender-ref ref="JSON"/>
        </root>
    </springProfile>
</configuration>
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/TestFixtures.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/TestFixtures.java`.

```java
package com.uniti.partnerportal;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.partner.PartnerTier;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Shared builders for unit tests: fixed clock, default properties and callers of each role. */
public final class TestFixtures {

    public static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");
    public static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private TestFixtures() {
    }

    public static PortalProperties properties() {
        return new PortalProperties(
                new PortalProperties.Security("roles", "partner_id"),
                new PortalProperties.Cors(List.of()),
                new PortalProperties.Pricing("GBP", 30, 40),
                new PortalProperties.Deals(90, 30, 1, 0.85),
                new PortalProperties.Commissions(90, 200, 25_000L),
                new PortalProperties.Mdf(60, 50),
                new PortalProperties.Cases(Map.of(), Map.of()));
    }

    public static CurrentUser agent(UUID partnerId) {
        return new CurrentUser("agent-1", "agent@partner.example", "Agent", partnerId, Set.of(Roles.PARTNER_AGENT));
    }

    public static CurrentUser admin(UUID partnerId) {
        return new CurrentUser("admin-1", "admin@partner.example", "Admin", partnerId, Set.of(Roles.PARTNER_ADMIN));
    }

    public static CurrentUser manager(String subject) {
        return new CurrentUser(subject, subject + "@uniti.example", subject, null, Set.of(Roles.CHANNEL_MANAGER));
    }

    /** An ACTIVE partner at the given tier, walked through the real onboarding transitions. */
    public static Partner activePartner(UUID id, PartnerTier tier) {
        Partner partner = new Partner(id, "PTR-2026-000001", "Acme Networks Ltd", "AB123456", "GBP");
        partner.transitionTo(PartnerStatus.KYC_PENDING, null, NOW);
        partner.transitionTo(PartnerStatus.KYC_UNDER_REVIEW, null, NOW);
        partner.transitionTo(PartnerStatus.ACTIVE, null, NOW);
        partner.setTier(tier, NOW);
        return partner;
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionCalculatorTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionCalculatorTest.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct.Category;
import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CommissionCalculatorTest {

    private final CommissionCalculator calculator = new CommissionCalculator();
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);

    private static CommissionRule rule(String name, Category category, PartnerTier minTier, int minTerm, int bps,
                                       long flat, String currency) {
        return new CommissionRule(UUID.randomUUID(), name, category, minTier, minTerm, bps, flat, currency, FROM, null);
    }

    private static CommissionCalculator.OrderBasis order(int term, boolean deal, boolean newLogo) {
        return new CommissionCalculator.OrderBasis("GBP", term, deal, newLogo, List.of(
                new CommissionCalculator.SiteBasis(Category.BROADBAND, 10_000),
                new CommissionCalculator.SiteBasis(Category.SDWAN, 20_000)));
    }

    @Test
    void stacksBaseDealUpliftNewLogoAndMatchingRules() {
        var rules = List.of(
                rule("SD-WAN accelerator", Category.SDWAN, null, 36, 300, 10_000, "GBP"),
                rule("Platinum only", null, PartnerTier.PLATINUM, 0, 500, 0, "GBP"),
                rule("Five-year push", null, null, 60, 500, 0, "GBP"),
                rule("Euro promo", null, null, 0, 500, 0, "EUR"));

        var result = calculator.calculate(order(36, true, true), PartnerTier.GOLD, rules,
                TestFixtures.properties().commissions());

        assertThat(result.firstYearValue().amountMinor()).isEqualTo(360_000);
        assertThat(result.lines()).extracting(CommissionCalculator.Line::component)
                .containsExactly("BASE", "DEAL_REGISTRATION", "NEW_LOGO", "RULE");
        assertThat(result.lines()).extracting(l -> l.amount().amountMinor())
                .containsExactly(45_000L, 7_200L, 25_000L, 17_200L);
        assertThat(result.total().amountMinor()).isEqualTo(94_400);
    }

    @Test
    void firstYearValueIsCappedAtTwelveMonthsButShortTermsUseTheirOwnLength() {
        var twelve = calculator.calculate(order(12, false, false), PartnerTier.REGISTERED, List.of(),
                TestFixtures.properties().commissions());
        var sixty = calculator.calculate(order(60, false, false), PartnerTier.REGISTERED, List.of(),
                TestFixtures.properties().commissions());

        assertThat(twelve.firstYearValue()).isEqualTo(sixty.firstYearValue());
        assertThat(twelve.lines()).singleElement()
                .satisfies(l -> assertThat(l.amount().amountMinor()).isEqualTo(28_800));
    }

    @Test
    void omitsZeroValueComponents() {
        var basis = new CommissionCalculator.OrderBasis("GBP", 12, false, false, List.of());

        var result = calculator.calculate(basis, PartnerTier.GOLD, List.of(), TestFixtures.properties().commissions());

        assertThat(result.lines()).isEmpty();
        assertThat(result.total().isZero()).isTrue();
    }

    @Test
    void formatsBasisPointsAsPercent() {
        assertThat(CommissionCalculator.bpsAsPercent(1250)).isEqualTo("12.50%");
        assertThat(CommissionCalculator.bpsAsPercent(205)).isEqualTo("2.05%");
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionServiceTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/commissions/CommissionServiceTest.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.orders.OrderSite;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.PartnerOrder;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommissionServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private CommissionRuleRepository rules;
    @Mock
    private CommissionEntryRepository entries;
    @Mock
    private CommissionStatementRepository statements;
    @Mock
    private CommissionPayoutRepository payouts;
    @Mock
    private PartnerOrderRepository orders;
    @Mock
    private PartnerService partners;
    @Mock
    private ReferenceGenerator references;

    private CommissionService service;

    @BeforeEach
    void setUp() {
        service = new CommissionService(rules, entries, statements, payouts, orders, partners,
                new CommissionCalculator(), references, TestFixtures.properties(), TestFixtures.CLOCK);
        when(partners.load(PARTNER_ID)).thenReturn(TestFixtures.activePartner(PARTNER_ID, PartnerTier.SILVER));
        when(references.next(ReferenceGenerator.Kind.STATEMENT)).thenReturn("CS-2026-000001");
        when(statements.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static PartnerOrder activeOrder(boolean newLogo) {
        PartnerOrder order = new PartnerOrder(UUID.randomUUID(), "ORD-2026-000001", PARTNER_ID, UUID.randomUUID(),
                "QT-2026-000001", "GBP", "agent-1");
        order.setTermMonths(36);
        order.assignAccount("ACC-50000001", newLogo);
        order.addSite(new OrderSite(UUID.randomUUID(), 1, "HQ", "LS1 4AP", "FBB-BUS-500", "Fibre 500",
                CatalogProduct.Category.BROADBAND, 1, 5_000));
        Instant at = TestFixtures.NOW.minus(3, ChronoUnit.DAYS);
        order.transitionTo(OrderStatus.SUBMITTED, "agent-1", null, at);
        order.transitionTo(OrderStatus.VALIDATED, "cm", null, at);
        order.transitionTo(OrderStatus.PROVISIONING, "cm", null, at);
        order.transitionTo(OrderStatus.ACTIVE, "cm", null, at);
        return order;
    }

    private static CommissionEntry entry(CommissionEntry.Type type, long amount, LocalDate on) {
        return new CommissionEntry(UUID.randomUUID(), PARTNER_ID, UUID.randomUUID(), "ORD-2026-000001", type, "BASE",
                "test", amount, "GBP", on, TestFixtures.NOW, "system");
    }

    @Test
    @SuppressWarnings("unchecked")
    void accruesBaseAndNewLogoOnActivation() {
        PartnerOrder order = activeOrder(true);
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));

        List<CommissionEntry> posted = service.accrueForOrder(order.getId());

        // SILVER 10% of 5,000 x 12 = 6,000 plus 25,000 new-logo bonus
        assertThat(posted).extracting(CommissionEntry::getComponent).containsExactly("BASE", "NEW_LOGO");
        assertThat(posted).extracting(CommissionEntry::getAmountMinor).containsExactly(6_000L, 25_000L);
        assertThat(posted).allSatisfy(e -> assertThat(e.getEarnedOn()).isEqualTo(LocalDate.of(2026, 11, 8)));
        verify(entries).saveAll(anyList());
    }

    @Test
    void accrualIsIdempotentPerOrder() {
        UUID orderId = UUID.randomUUID();
        when(entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)).thenReturn(true);

        assertThat(service.accrueForOrder(orderId)).isEmpty();
        verify(orders, never()).findById(any());
    }

    @Test
    void clawsBackEveryAccrualWhenCeasedInsideTheWindow() {
        UUID orderId = UUID.randomUUID();
        when(entries.findByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)).thenReturn(List.of(
                entry(CommissionEntry.Type.ACCRUAL, 6_000, LocalDate.of(2026, 10, 1)),
                entry(CommissionEntry.Type.ACCRUAL, 25_000, LocalDate.of(2026, 10, 1))));

        var reversals = service.clawbackForOrder(orderId, TestFixtures.NOW.minus(40, ChronoUnit.DAYS),
                TestFixtures.NOW, "Customer went into administration");

        assertThat(reversals).extracting(CommissionEntry::getAmountMinor).containsExactly(-6_000L, -25_000L);
        assertThat(reversals).allSatisfy(e -> assertThat(e.getType()).isEqualTo(CommissionEntry.Type.CLAWBACK));
    }

    @Test
    void keepsCommissionWhenCeasedAfterTheWindow() {
        var reversals = service.clawbackForOrder(UUID.randomUUID(), TestFixtures.NOW.minus(91, ChronoUnit.DAYS),
                TestFixtures.NOW, "Moved premises");

        assertThat(reversals).isEmpty();
        verify(entries, never()).saveAll(anyList());
    }

    @Test
    void statementSweepsUnbilledEntriesAndBringsForwardSmallBalances() {
        YearMonth october = YearMonth.of(2026, 10);
        CommissionStatement previous = new CommissionStatement(UUID.randomUUID(), "CS-2026-000000", PARTNER_ID,
                LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30), "GBP");
        previous.recalculate(List.of(entry(CommissionEntry.Type.ACCRUAL, 3_000, LocalDate.of(2026, 9, 3))), 0);
        previous.issue(TestFixtures.NOW);
        previous.decide(StatementStatus.CARRIED_FORWARD, "cm", TestFixtures.NOW);
        List<CommissionEntry> unbilled = List.of(
                entry(CommissionEntry.Type.ACCRUAL, 40_000, LocalDate.of(2026, 10, 5)),
                entry(CommissionEntry.Type.CLAWBACK, -6_000, LocalDate.of(2026, 10, 20)));
        when(entries.findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(PARTNER_ID, october.atEndOfMonth()))
                .thenReturn(unbilled);
        when(statements.findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(PARTNER_ID,
                StatementStatus.CARRIED_FORWARD)).thenReturn(List.of(previous));

        CommissionStatement statement = service.generateStatement(PARTNER_ID, october).orElseThrow();

        assertThat(statement.getAccruedMinor()).isEqualTo(40_000);
        assertThat(statement.getClawbackMinor()).isEqualTo(-6_000);
        assertThat(statement.getBroughtForwardMinor()).isEqualTo(3_000);
        assertThat(statement.getNetPayableMinor()).isEqualTo(37_000);
        assertThat(previous.getCarriedIntoStatementId()).isEqualTo(statement.getId());
        assertThat(unbilled).allSatisfy(e -> assertThat(e.getStatementId()).isEqualTo(statement.getId()));
    }

    @Test
    void refusesToBillTheCurrentMonth() {
        assertThatThrownBy(() -> service.generateStatement(PARTNER_ID, YearMonth.of(2026, 11)))
                .hasMessageContaining("closed months");
    }

    @Test
    void approvalSchedulesPayoutOrCarriesForwardBelowMinimum() {
        CommissionStatement big = issuedStatement(40_000);
        CommissionStatement small = issuedStatement(4_999);

        service.approve(big.getId(), TestFixtures.manager("cm-1"));
        service.approve(small.getId(), TestFixtures.manager("cm-1"));

        ArgumentCaptor<CommissionPayout> payout = ArgumentCaptor.forClass(CommissionPayout.class);
        verify(payouts).save(payout.capture());
        assertThat(payout.getValue().getAmountMinor()).isEqualTo(40_000);
        assertThat(payout.getValue().getScheduledFor()).isEqualTo(LocalDate.of(2026, 12, 11));
        assertThat(big.getStatus()).isEqualTo(StatementStatus.APPROVED);
        assertThat(small.getStatus()).isEqualTo(StatementStatus.CARRIED_FORWARD);
    }

    @Test
    void partnersCanOnlyDisputeWithinTheWindow() {
        CommissionStatement fresh = issuedStatement(10_000);
        CommissionStatement stale = new CommissionStatement(UUID.randomUUID(), "CS-OLD", PARTNER_ID,
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), "GBP");
        stale.issue(TestFixtures.NOW.minus(31, ChronoUnit.DAYS));
        when(statements.findById(stale.getId())).thenReturn(Optional.of(stale));

        service.dispute(fresh.getId(), "Missing order ORD-2026-000004", TestFixtures.admin(PARTNER_ID));

        assertThat(fresh.getStatus()).isEqualTo(StatementStatus.DISPUTED);
        assertThatThrownBy(() -> service.dispute(stale.getId(), "late", TestFixtures.admin(PARTNER_ID)))
                .isInstanceOf(PortalException.BusinessRule.class);
    }

    private CommissionStatement issuedStatement(long net) {
        CommissionStatement s = new CommissionStatement(UUID.randomUUID(), "CS-" + net, PARTNER_ID,
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), "GBP");
        s.recalculate(List.of(entry(CommissionEntry.Type.ACCRUAL, net, LocalDate.of(2026, 10, 2))), 0);
        s.issue(TestFixtures.NOW);
        when(statements.findById(s.getId())).thenReturn(Optional.of(s));
        return s;
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/dashboard/PipelineKpisTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/dashboard/PipelineKpisTest.java`.

```java
package com.uniti.partnerportal.dashboard;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PipelineKpisTest {

    @Test
    void rateIsNullWhenNothingHasClosed() {
        assertThat(PipelineKpis.rate(0, 0)).isNull();
    }

    @Test
    void rateRoundsHalfEvenToOneDecimal() {
        assertThat(PipelineKpis.rate(1, 2)).isEqualByComparingTo("33.3");
        assertThat(PipelineKpis.rate(2, 1)).isEqualByComparingTo("66.7");
        assertThat(PipelineKpis.rate(5, 0)).isEqualByComparingTo("100.0");
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/orders/OrderServiceTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/orders/OrderServiceTest.java`.

```java
package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.orders.dto.OrderDtos.CreateOrderRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.SiteProgressRequest;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.Quote;
import com.uniti.partnerportal.quotes.QuoteLine;
import com.uniti.partnerportal.quotes.QuoteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private PartnerOrderRepository orders;
    @Mock
    private QuoteService quotes;
    @Mock
    private CatalogProductRepository catalog;
    @Mock
    private PartnerService partners;
    @Mock
    private ReferenceGenerator references;
    @Mock
    private ApplicationEventPublisher events;

    private OrderService service;
    private final CurrentUser agent = TestFixtures.agent(PARTNER_ID);
    private final CurrentUser manager = TestFixtures.manager("cm-1");

    @BeforeEach
    void setUp() {
        service = new OrderService(orders, quotes, catalog, partners, references, events, TestFixtures.CLOCK);
        when(references.next(ReferenceGenerator.Kind.ORDER)).thenReturn("ORD-2026-000001");
        when(references.next(ReferenceGenerator.Kind.ACCOUNT)).thenReturn("ACC-50000001");
        when(orders.save(any(PartnerOrder.class))).thenAnswer(inv -> inv.getArgument(0));
        when(catalog.findBySkuIn(anyCollection())).thenReturn(List.of(new CatalogProduct(UUID.randomUUID(),
                "FBB-BUS-500", "Business Fibre 500 Mbps", CatalogProduct.Category.BROADBAND, 500, 5_500, 9_900,
                4_000, 12, true, "GBP")));
    }

    private Quote acceptedQuote(String accountId) {
        Quote quote = new Quote(UUID.randomUUID(), "QT-2026-000009", PARTNER_ID, "GBP");
        quote.setCustomerName("Northwind Logistics");
        quote.setCustomerAccountId(accountId);
        quote.setCustomerContactEmail("it@northwind.example");
        quote.setTermMonths(36);
        quote.replaceLines(List.of(
                new QuoteLine(UUID.randomUUID(), 1, "FBB-BUS-500", "Business Fibre 500 Mbps", "HQ", "LS1 4AP", 1,
                        5_500, 9_900, 4_000),
                new QuoteLine(UUID.randomUUID(), 2, "FBB-BUS-500", "Business Fibre 500 Mbps", "Depot", "LS9 8AB", 1,
                        5_500, 9_900, 4_000)));
        when(quotes.claimForOrder(quote.getId(), agent)).thenReturn(quote);
        return quote;
    }

    private PartnerOrder provisioningOrder() {
        PartnerOrder order = service.createFromQuote(
                new CreateOrderRequest(acceptedQuote("ACC-12345678").getId(), "PO-77", null), agent);
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));
        service.validate(order.getId(), manager);
        service.startProvisioning(order.getId(), manager);
        return order;
    }

    @Test
    void createsOneSitePerQuoteLineAndMintsAnAccountForNewLogos() {
        Quote quote = acceptedQuote(null);

        PartnerOrder order = service.createFromQuote(new CreateOrderRequest(quote.getId(), null, null), agent);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.SUBMITTED);
        assertThat(order.isNewLogo()).isTrue();
        assertThat(order.getCustomerAccountId()).isEqualTo("ACC-50000001");
        assertThat(order.getSites()).extracting(OrderSite::getSiteName).containsExactly("HQ", "Depot");
        assertThat(order.getSites()).allSatisfy(s ->
                assertThat(s.getProductCategory()).isEqualTo(CatalogProduct.Category.BROADBAND));
        assertThat(order.getEvents()).singleElement()
                .satisfies(e -> assertThat(e.getDetail()).contains("DRAFT -> SUBMITTED"));
    }

    @Test
    void aQuoteCanOnlyBeOrderedOnce() {
        PartnerOrder existing = new PartnerOrder(UUID.randomUUID(), "ORD-2026-000000", PARTNER_ID, UUID.randomUUID(),
                "QT-2026-000009", "GBP", "agent-1");
        UUID quoteId = UUID.randomUUID();
        when(orders.findByQuoteId(quoteId)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.createFromQuote(new CreateOrderRequest(quoteId, null, null), agent))
                .isInstanceOf(PortalException.Conflict.class);
        verify(quotes, never()).claimForOrder(any(), any());
    }

    @Test
    void activatesAndPublishesWhenTheLastSiteGoesLive() {
        PartnerOrder order = provisioningOrder();
        UUID first = order.getSites().get(0).getId();
        UUID second = order.getSites().get(1).getId();

        service.updateSite(order.getId(), first, new SiteProgressRequest(ProvisioningStage.LIVE, null, null, "SVC-1"),
                manager);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PROVISIONING);

        service.updateSite(order.getId(), second, new SiteProgressRequest(ProvisioningStage.LIVE, null, null, "SVC-2"),
                manager);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.ACTIVE);
        assertThat(order.getActivatedAt()).isEqualTo(TestFixtures.NOW);
        verify(events).publishEvent(new OrderEvents.OrderActivated(order.getId(), PARTNER_ID, TestFixtures.NOW));
    }

    @Test
    void sitesNeverMoveBackwardsAndUnblockOnlyForward() {
        PartnerOrder order = provisioningOrder();
        UUID site = order.getSites().get(0).getId();
        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.ENGINEER_BOOKED, null, null, null), manager);

        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.SURVEY_COMPLETE, null, null, null), manager))
                .isInstanceOf(PortalException.Conflict.class);

        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BLOCKED, "Wayleave refused", null, null), manager);
        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BUILD_SCHEDULED, null, null, null), manager))
                .isInstanceOf(PortalException.Conflict.class);
        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.INSTALLED, null, null, null), manager);

        assertThat(order.getSites().get(0).getStage()).isEqualTo(ProvisioningStage.INSTALLED);
        assertThat(order.getSites().get(0).getBlockerNote()).isNull();
    }

    @Test
    void liveSitesRequireAServiceIdAndBlockersRequireANote() {
        PartnerOrder order = provisioningOrder();
        UUID site = order.getSites().get(0).getId();

        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.LIVE, null, null, " "), manager))
                .hasMessageContaining("service ID");
        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BLOCKED, null, null, null), manager))
                .hasMessageContaining("blocked");
    }

    @Test
    void cancellationIsRefusedOnceProvisioningHasStarted() {
        PartnerOrder order = provisioningOrder();

        assertThatThrownBy(() -> service.cancel(order.getId(), "Customer changed mind", agent))
                .isInstanceOf(PortalException.InvalidTransition.class);
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuotePricingEngineTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuotePricingEngineTest.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class QuotePricingEngineTest {

    private final QuotePricingEngine engine = new QuotePricingEngine();

    private static QuoteLine line(int no, String site, String postcode, long mrc, long nrc, long floor) {
        return new QuoteLine(UUID.randomUUID(), no, "FBB-BUS-500", "Business Fibre 500 Mbps", site, postcode, 1,
                mrc, nrc, floor);
    }

    private QuotePricingEngine.PricingResult price(List<QuoteLine> lines, int term, String discount,
                                                   PartnerTier tier, boolean protectedDeal) {
        return engine.price(new QuotePricingEngine.PricingInput(lines, term, new BigDecimal(discount), tier,
                protectedDeal, new BigDecimal("40"), "GBP"));
    }

    @Test
    void appliesTermThenVolumeThenPartnerDiscountInOrder() {
        List<QuoteLine> lines = IntStream.rangeClosed(1, 5)
                .mapToObj(i -> line(i, "Site " + i, "LS1 " + i + "AA", 10_000, 9_900, 5_000))
                .toList();

        var result = price(lines, 36, "5", PartnerTier.GOLD, true);

        // per line: 10000 -10% = 9000, -3% volume = 8730, -5% partner = 8293.5 -> 8294 (HALF_EVEN of 436.5 = 436)
        assertThat(result.listMrc().amountMinor()).isEqualTo(50_000);
        assertThat(result.termDiscount().amountMinor()).isEqualTo(5_000);
        assertThat(result.volumeDiscount().amountMinor()).isEqualTo(1_350);
        assertThat(result.partnerDiscount().amountMinor()).isEqualTo(5 * 436);
        assertThat(result.netMrc().amountMinor()).isEqualTo(5 * 8_294);
        assertThat(result.volumeDiscountPercent()).isEqualByComparingTo("3");
        assertThat(result.isQuotable()).isTrue();
    }

    @Test
    void waivesInstallationOnThirtySixMonthTermsAndChargesItOnShorterTerms() {
        List<QuoteLine> lines = List.of(line(1, "HQ", "M1 1AA", 10_000, 9_900, 5_000));

        var thirtySix = price(lines, 36, "0", PartnerTier.SILVER, false);
        var twentyFour = price(lines, 24, "0", PartnerTier.SILVER, false);

        assertThat(thirtySix.nrcWaived()).isTrue();
        assertThat(thirtySix.nrc().isZero()).isTrue();
        assertThat(thirtySix.totalContractValue().amountMinor()).isEqualTo(9_000L * 36);
        assertThat(twentyFour.nrcWaived()).isFalse();
        assertThat(twentyFour.totalContractValue().amountMinor()).isEqualTo(9_500L * 24 + 9_900);
    }

    @Test
    void sameSiteWithDifferentSpacingAndCaseCountsOnce() {
        List<QuoteLine> lines = List.of(
                line(1, "Head Office", "LS1 4AP", 1_000, 0, 0),
                line(2, " head office ", "ls14ap", 1_000, 0, 0));

        assertThat(QuotePricingEngine.distinctSites(lines)).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({
            "GOLD, true, 15, NONE",
            "GOLD, true, 25, CHANNEL_MANAGER",
            "GOLD, true, 25.001, DEAL_DESK",
            "GOLD, false, 7.5, NONE",
            "GOLD, false, 8, CHANNEL_MANAGER",
            "REGISTERED, true, 16, DEAL_DESK"
    })
    void routesApprovalByDiscountAgainstTierAllowance(PartnerTier tier, boolean protectedDeal, String discount,
                                                      ApprovalLevel expected) {
        var result = price(List.of(line(1, "HQ", "M1 1AA", 100_000, 0, 0)), 12, discount, tier, protectedDeal);

        assertThat(result.approvalLevel()).isEqualTo(expected);
    }

    @Test
    void blocksQuotesBelowFloorAboveMaximumOrWithInvalidTerm() {
        var floorBreach = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 9_000)), 12, "20", PartnerTier.GOLD, true);
        var overMax = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 12, "41", PartnerTier.GOLD, true);
        var badTerm = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 18, "0", PartnerTier.GOLD, true);

        assertThat(floorBreach.floorBreaches()).singleElement()
                .satisfies(b -> assertThat(b.lineNo()).isEqualTo(1));
        assertThat(floorBreach.isQuotable()).isFalse();
        assertThat(overMax.blockers()).anyMatch(b -> b.contains("programme maximum"));
        assertThat(badTerm.blockers()).anyMatch(b -> b.startsWith("Term must be one of"));
    }

    @Test
    void effectiveDiscountReflectsWholeStack() {
        var result = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 60, "0", PartnerTier.SILVER, false);

        assertThat(result.effectiveDiscountPercent()).isEqualByComparingTo("15.000");
    }
}
```

## apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuoteServiceTest.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/test/java/com/uniti/partnerportal/quotes/QuoteServiceTest.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerTier;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QuoteServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private QuoteRepository quotes;
    @Mock
    private CatalogProductRepository catalog;
    @Mock
    private PartnerService partners;
    @Mock
    private DealRegistrationService deals;
    @Mock
    private ReferenceGenerator references;

    private QuoteService service;
    private final CurrentUser agent = TestFixtures.agent(PARTNER_ID);

    @BeforeEach
    void setUp() {
        service = new QuoteService(quotes, catalog, new QuotePricingEngine(), partners, deals, references,
                TestFixtures.properties(), TestFixtures.CLOCK);
        Partner partner = TestFixtures.activePartner(PARTNER_ID, PartnerTier.SILVER);
        when(partners.requireTransactingPartner(PARTNER_ID)).thenReturn(partner);
        when(references.next(ReferenceGenerator.Kind.QUOTE)).thenReturn("QT-2026-000001");
        when(quotes.save(any(Quote.class))).thenAnswer(inv -> inv.getArgument(0));
        when(catalog.findBySkuIn(anyCollection())).thenReturn(List.of(
                new CatalogProduct(UUID.randomUUID(), "FBB-BUS-500", "Business Fibre 500 Mbps",
                        CatalogProduct.Category.BROADBAND, 500, 5_500, 9_900, 4_000, 12, true, "GBP"),
                new CatalogProduct(UUID.randomUUID(), "SDW-VC-EDGE", "SD-WAN Edge",
                        CatalogProduct.Category.SDWAN, null, 18_500, 25_000, 14_000, 36, true, "GBP")));
    }

    private static QuoteRequest request(int term, String discount, String justification, String... skus) {
        List<QuoteLineRequest> lines = java.util.Arrays.stream(skus)
                .map(sku -> new QuoteLineRequest(sku, "Head Office", "LS1 4AP", 3))
                .toList();
        return new QuoteRequest(null, null, "Northwind Logistics", null, "IT@northwind.example", term,
                new BigDecimal(discount), justification, lines);
    }

    private Quote created(QuoteRequest request) {
        Quote quote = service.create(request, agent);
        when(quotes.findById(quote.getId())).thenReturn(Optional.of(quote));
        return quote;
    }

    @Test
    void createSnapshotsCatalogPricesAndForcesQuantityOneForPerSiteProducts() {
        Quote quote = created(request(36, "0", null, "FBB-BUS-500"));

        assertThat(quote.getLines()).singleElement().satisfies(l -> {
            assertThat(l.getQuantity()).isEqualTo(1);
            assertThat(l.getUnitMrcMinor()).isEqualTo(5_500);
            assertThat(l.getUnitFloorMrcMinor()).isEqualTo(4_000);
        });
        assertThat(quote.getCustomerContactEmail()).isEqualTo("it@northwind.example");
        assertThat(quote.getNetMrcMinor()).isEqualTo(4_950);
    }

    @Test
    void rejectsProductsWhoseMinimumTermExceedsTheQuoteTerm() {
        assertThatThrownBy(() -> service.create(request(24, "0", null, "SDW-VC-EDGE"), agent))
                .isInstanceOf(PortalException.BusinessRule.class)
                .satisfies(ex -> assertThat(((PortalException) ex).getDetails().get("problems").toString())
                        .contains("minimum term of 36"));
    }

    @Test
    void rejectsUnknownSkus() {
        assertThatThrownBy(() -> service.create(request(12, "0", null, "NOPE"), agent))
                .hasMessageContaining("invalid");
    }

    @Test
    void submitWithinAllowanceSelfApprovesAndStartsValidity() {
        Quote quote = created(request(12, "4", null, "FBB-BUS-500"));

        service.submit(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.APPROVED);
        assertThat(quote.getValidUntil()).isEqualTo(TestFixtures.NOW.plus(30, ChronoUnit.DAYS));
    }

    @Test
    void submitNeedingApprovalRequiresJustification() {
        Quote quote = created(request(12, "12", null, "FBB-BUS-500"));

        assertThatThrownBy(() -> service.submit(quote.getId(), agent))
                .hasMessageContaining("justification");
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.DRAFT);
    }

    @Test
    void dealDeskQuotesNeedTwoDistinctManagers() {
        Quote quote = created(request(36, "18", "Competitive displacement of incumbent", "FBB-BUS-500"));
        service.submit(quote.getId(), agent);
        assertThat(quote.getApprovalLevel()).isEqualTo(ApprovalLevel.DEAL_DESK);

        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-1"));
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.PENDING_APPROVAL);

        assertThatThrownBy(() -> service.approve(quote.getId(), "again", TestFixtures.manager("cm-1")))
                .isInstanceOf(PortalException.Conflict.class);

        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-2"));
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.APPROVED);
        assertThat(quote.approvalsForCurrentRevision()).isEqualTo(2);
    }

    @Test
    void revisingVoidsEarlierApprovals() {
        Quote quote = created(request(12, "12", "Price match", "FBB-BUS-500"));
        service.submit(quote.getId(), agent);
        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-1"));

        service.revise(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.DRAFT);
        assertThat(quote.getRevision()).isEqualTo(2);
        assertThat(quote.approvalsForCurrentRevision()).isZero();
    }

    @Test
    void onlyAcceptedQuotesCanBeClaimedForAnOrder() {
        Quote quote = created(request(12, "0", null, "FBB-BUS-500"));
        service.submit(quote.getId(), agent);

        assertThatThrownBy(() -> service.claimForOrder(quote.getId(), agent))
                .hasMessageContaining("Only accepted quotes");

        service.markSent(quote.getId(), agent);
        service.recordCustomerDecision(quote.getId(), true, null, agent);
        service.claimForOrder(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.ORDERED);
    }

    @Test
    void anotherPartnerCannotReadTheQuote() {
        Quote quote = created(request(12, "0", null, "FBB-BUS-500"));

        assertThatThrownBy(() -> service.get(quote.getId(), TestFixtures.agent(UUID.randomUUID())))
                .isInstanceOf(PortalException.Forbidden.class);
    }
}
```

## apps/enterprise-partner-portal/frontend/.env.example

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: bash. Path: `apps/enterprise-partner-portal/frontend/.env.example`.

```bash
# OIDC provider (authorization code + PKCE, public client)
VITE_OIDC_AUTHORITY=https://login.uniti.example/realms/partners
VITE_OIDC_CLIENT_ID=enterprise-partner-portal-ui
VITE_OIDC_SCOPE=openid profile email
# Claims carrying roles and partner binding; must match the API's JWT_ROLES_CLAIM / JWT_PARTNER_CLAIM
VITE_JWT_ROLES_CLAIM=roles
VITE_JWT_PARTNER_CLAIM=partner_id
# API base; leave empty to use the same origin (Vite proxies /api in development)
VITE_API_BASE_URL=
```

## apps/enterprise-partner-portal/frontend/index.html

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: html. Path: `apps/enterprise-partner-portal/frontend/index.html`.

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Uniti Partner Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## apps/enterprise-partner-portal/frontend/package.json

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: json. Path: `apps/enterprise-partner-portal/frontend/package.json`.

```json
{
  "name": "enterprise-partner-portal-ui",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/react": "16.0.1",
    "@testing-library/user-event": "14.5.2",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.2",
    "jsdom": "25.0.1",
    "typescript": "5.6.2",
    "vite": "5.4.8",
    "vitest": "2.1.2"
  }
}
```

## apps/enterprise-partner-portal/frontend/src/App.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/App.tsx`.

```tsx
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApiProvider } from './api/ApiContext';
import type { Role } from './api/types';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Forbidden, RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { CatalogPage } from './pages/CatalogPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { LeadsPage } from './pages/LeadsPage';
import { QuoteBuilderPage } from './pages/QuoteBuilderPage';
import { QuotesPage } from './pages/QuotesPage';
import { TeamPage } from './pages/TeamPage';

const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];
const ADMIN: Role[] = ['PARTNER_ADMIN'];

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  return <RequireRole roles={roles} fallback={<Forbidden />}>{children}</RequireRole>;
}

/** Sends anonymous users to the IdP and holds rendering until the session is known. */
function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, login } = useAuth();
  useEffect(() => {
    if (status === 'anonymous') {
      login();
    }
  }, [status, login]);
  if (status === 'error') {
    return (
      <section className="panel" role="alert">
        <h2>Sign-in failed</h2>
        <p>{error}</p>
        <button type="button" onClick={() => login('/')}>Try again</button>
      </section>
    );
  }
  if (status !== 'authenticated') {
    return <p className="loading">Signing you in…</p>;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Guard roles={PARTNER}><DashboardPage /></Guard>} />
        <Route path="leads" element={<Guard roles={PARTNER}><LeadsPage /></Guard>} />
        <Route path="deals" element={<Guard roles={PARTNER}><DealsPage /></Guard>} />
        <Route path="quotes" element={<Guard roles={PARTNER}><QuotesPage /></Guard>} />
        <Route path="quotes/new" element={<Guard roles={PARTNER}><QuoteBuilderPage /></Guard>} />
        <Route path="catalog" element={<Guard roles={PARTNER}><CatalogPage /></Guard>} />
        <Route path="commissions" element={<Guard roles={ADMIN}><CommissionsPage /></Guard>} />
        <Route path="team" element={<Guard roles={ADMIN}><TeamPage /></Guard>} />
        <Route path="callback" element={<Navigate to="/" replace />} />
        <Route path="*" element={<section className="panel"><h2>Page not found</h2></section>} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionGate>
          <ApiProvider>
            <AppRoutes />
          </ApiProvider>
        </SessionGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

## apps/enterprise-partner-portal/frontend/src/api/ApiContext.tsx

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: tsx. Path: `apps/enterprise-partner-portal/frontend/src/api/ApiContext.tsx`.

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { createApiClient } from './client';
import { endpoints, type Endpoints } from './endpoints';

const ApiContext = createContext<Endpoints | undefined>(undefined);

export function ApiProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { accessToken, sessionExpired } = auth;
  const api = useMemo(() => endpoints(createApiClient({
    baseUrl: config().apiBaseUrl,
    getAccessToken: accessToken,
    onUnauthorized: sessionExpired,
  })), [accessToken, sessionExpired]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useEndpoints(): Endpoints {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useEndpoints must be used inside <ApiProvider>');
  }
  return ctx;
}

/** Lets tests inject stubbed endpoints. */
export const ApiTestProvider = ApiContext.Provider;
```

## apps/enterprise-partner-portal/frontend/src/api/client.test.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/api/client.test.ts`.

```typescript
import { describe, expect, it, vi } from 'vitest';
import { buildUrl, createApiClient } from './client';
import { ProblemError } from './problem';

function jsonResponse(status: number, body: unknown, contentType = 'application/json', headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType, ...headers } });
}

function client(fetchImpl: typeof fetch, onUnauthorized = vi.fn()) {
  return {
    onUnauthorized,
    api: createApiClient({
      baseUrl: 'https://api.example',
      getAccessToken: () => 'tok-123',
      onUnauthorized,
      fetchImpl,
      newCorrelationId: () => 'corr-0001-abcd',
    }),
  };
}

describe('buildUrl', () => {
  it('drops empty query values and encodes the rest', () => {
    expect(buildUrl('', '/api/v1/leads', { status: 'NEW', q: 'a&b', page: 2, mine: undefined, x: '' }))
      .toBe('/api/v1/leads?status=NEW&q=a%26b&page=2');
  });
});

describe('createApiClient', () => {
  it('sends bearer token, correlation id and JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'q-1' }));
    const { api } = client(fetchImpl);

    const result = await api.request<{ id: string }>('/api/v1/quotes', { method: 'POST', body: { a: 1 } });

    expect(result.id).toBe('q-1');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example/api/v1/quotes');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok-123',
      'X-Correlation-Id': 'corr-0001-abcd',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"a":1}');
  });

  it('turns problem+json into a ProblemError with field errors and rule details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(422, {
      status: 422,
      detail: 'The quote cannot be submitted as priced',
      code: 'quote.not_quotable',
      correlationId: 'server-corr',
      blockers: ['1 line(s) priced below the floor price'],
      errors: [{ field: 'customerName', message: 'must not be blank' }],
    }, 'application/problem+json'));
    const { api } = client(fetchImpl);

    const error = await api.request('/api/v1/quotes/x/submit', { method: 'POST' }).catch((e) => e);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error.code).toBe('quote.not_quotable');
    expect(error.correlationId).toBe('server-corr');
    expect(error.listDetail('blockers')).toEqual(['1 line(s) priced below the floor price']);
    expect(error.fieldErrors).toEqual({ customerName: 'must not be blank' });
  });

  it('falls back to the response correlation header for non-JSON failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Bad gateway', {
      status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html', 'x-correlation-id': 'edge-1' },
    }));
    const { api } = client(fetchImpl);

    const error = await api.request('/api/v1/leads').catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.code).toBe('http.502');
    expect(error.correlationId).toBe('edge-1');
  });

  it('notifies the auth layer on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { status: 401, code: 'auth.unauthenticated' },
      'application/problem+json'));
    const { api, onUnauthorized } = client(fetchImpl);

    await expect(api.request('/api/v1/leads')).rejects.toBeInstanceOf(ProblemError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('returns undefined for 204 responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const { api } = client(fetchImpl);

    await expect(api.request('/api/v1/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
```

## apps/enterprise-partner-portal/frontend/src/api/client.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/api/client.ts`.

```typescript
import { toProblemError } from './problem';

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | undefined;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
  newCorrelationId?: () => string;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * Thin fetch wrapper used by every page: attaches the bearer token and a fresh
 * X-Correlation-Id per request, and turns non-2xx responses into ProblemError so callers
 * handle one error shape. A 401 means the session is gone, so the auth layer is told.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newId = options.newCorrelationId ?? (() => crypto.randomUUID());

  return {
    async request<T>(path: string, { method = 'GET', query, body, signal }: RequestOptions = {}): Promise<T> {
      const correlationId = newId();
      const headers: Record<string, string> = {
        Accept: 'application/json, application/problem+json',
        'X-Correlation-Id': correlationId,
      };
      const token = options.getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await doFetch(buildUrl(options.baseUrl, path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        if (response.status === 401) {
          options.onUnauthorized();
        }
        throw await toProblemError(response, correlationId);
      }
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T;
      }
      return (await response.json()) as T;
    },
  };
}
```

## apps/enterprise-partner-portal/frontend/src/api/endpoints.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/api/endpoints.ts`.

```typescript
import type { ApiClient } from './client';
import type {
  CommissionSummary, ConvertLeadRequest, ConvertLeadResult, Deal, DealStatus, Lead, LeadRequest, LeadStatus, Page,
  PartnerUser, PartnerUserRole, PipelineKpis, PricingPreview, Product, ProductCategory, Quote, QuoteRequest,
  QuoteStatus, SeatUsage, Statement, StatementDetail,
} from './types';

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** Typed wrappers over the REST resources, grouped by module. */
export function endpoints(api: ApiClient) {
  return {
    dashboard: {
      pipeline: (days: number) => api.request<PipelineKpis>('/api/v1/dashboard/pipeline', { query: { days } }),
    },
    leads: {
      search: (q: PageQuery & { status?: LeadStatus; mine?: boolean; q?: string; sort?: 'score' | 'createdAt' }) =>
        api.request<Page<Lead>>('/api/v1/leads', { query: { ...q } }),
      create: (body: LeadRequest) => api.request<Lead>('/api/v1/leads', { method: 'POST', body }),
      transition: (id: string, status: LeadStatus, reason?: string) =>
        api.request<Lead>(`/api/v1/leads/${id}/transition`, { method: 'POST', body: { status, reason } }),
      convert: (id: string, body: ConvertLeadRequest) =>
        api.request<ConvertLeadResult>(`/api/v1/leads/${id}/convert`, { method: 'POST', body }),
    },
    deals: {
      search: (q: PageQuery & { status?: DealStatus; q?: string }) =>
        api.request<Page<Deal>>('/api/v1/deals', { query: { ...q } }),
      extend: (id: string) => api.request<Deal>(`/api/v1/deals/${id}/extend`, { method: 'POST' }),
      outcome: (id: string, outcome: 'WON' | 'LOST', reason?: string) =>
        api.request<Deal>(`/api/v1/deals/${id}/outcome`, { method: 'POST', body: { outcome, reason } }),
    },
    catalog: {
      list: (category?: ProductCategory) =>
        api.request<Product[]>('/api/v1/catalog/products', { query: { category } }),
    },
    quotes: {
      search: (q: PageQuery & { status?: QuoteStatus; q?: string }) =>
        api.request<Page<Quote>>('/api/v1/quotes', { query: { ...q } }),
      preview: (body: QuoteRequest, signal?: AbortSignal) =>
        api.request<PricingPreview>('/api/v1/quotes/preview', { method: 'POST', body, signal }),
      create: (body: QuoteRequest) => api.request<Quote>('/api/v1/quotes', { method: 'POST', body }),
      submit: (id: string) => api.request<Quote>(`/api/v1/quotes/${id}/submit`, { method: 'POST' }),
    },
    commissions: {
      summary: () => api.request<CommissionSummary>('/api/v1/commissions/summary'),
      statements: (q: PageQuery) => api.request<Page<Statement>>('/api/v1/commissions/statements', { query: { ...q } }),
      statement: (id: string) => api.request<StatementDetail>(`/api/v1/commissions/statements/${id}`),
      dispute: (id: string, reason: string) =>
        api.request<Statement>(`/api/v1/commissions/statements/${id}/dispute`, { method: 'POST', body: { reason } }),
    },
    users: {
      list: (partnerId: string, q: PageQuery) =>
        api.request<Page<PartnerUser>>(`/api/v1/partners/${partnerId}/users`, { query: { ...q } }),
      seats: (partnerId: string) => api.request<SeatUsage>(`/api/v1/partners/${partnerId}/users/seats`),
      invite: (partnerId: string, body: { email: string; firstName: string; lastName: string; role: PartnerUserRole }) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users`, { method: 'POST', body }),
      update: (partnerId: string, user: PartnerUser, role: PartnerUserRole) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${user.id}`, {
          method: 'PUT',
          body: { firstName: user.firstName, lastName: user.lastName, role },
        }),
      resendInvite: (partnerId: string, userId: string) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${userId}/resend-invite`, { method: 'POST' }),
      deactivate: (partnerId: string, userId: string) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${userId}/deactivate`, { method: 'POST' }),
    },
  };
}

export type Endpoints = ReturnType<typeof endpoints>;
```

## apps/enterprise-partner-portal/frontend/src/api/problem.ts

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: typescript. Path: `apps/enterprise-partner-portal/frontend/src/api/problem.ts`.

```typescript
/** RFC 7807 problem details as emitted by the API, including the portal's extension members. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  errors?: { field: string; message: string }[];
  [extension: string]: unknown;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || `Request failed with status ${problem.status}`);
    this.name = 'ProblemError';
    this.status = problem.status;
    this.code = problem.code || `http.${problem.status}`;
    this.correlationId = problem.correlationId;
    this.problem = problem;
  }

  /** Validation errors keyed by field name, for highlighting form inputs. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem.errors ?? []) {
      out[e.field] ??= e.message;
    }
    return out;
  }

  /** Business-rule details the API attaches as string lists (blockers, problems, missing). */
  listDetail(key: string): string[] {
    const value = this.problem[key];
    return Array.isArray(value) ? value.map(String) : [];
  }
}

const PROBLEM_TYPES = ['application/problem+json', 'application/json'];

/**
 * Converts a failed response into a ProblemError. Non-JSON bodies (proxies, gateways) still
 * yield a usable error carrying the correlation ID from the response header.
 */
export async function toProblemError(response: Response, sentCorrelationId: string): Promise<ProblemError> {
  const contentType = response.headers.get('content-type') ?? '';
  const correlationId = response.headers.get('x-correlation-id') ?? sentCorrelationId;
  if (PROBLEM_TYPES.some((t) => contentType.includes(t))) {
    try {
      const body = (await response.json()) as Partial<ProblemDetails>;
      return new ProblemError({ ...body, status: body.status ?? response.status, correlationId: body.correlationId ?? correlationId });
    } catch {
      // fall through to the generic problem below
    }
  }
  return new ProblemError({
    status: response.status,
    title: response.statusText || 'Request failed',
    code: `http.${response.status}`,
    correlationId,
  });
}

export function describeError(error: unknown): string {
  if (error instanceof ProblemError) {
    const ref = error.correlationId ? ` (reference ${error.correlationId})` : '';
    return `${error.message}${ref}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}
```

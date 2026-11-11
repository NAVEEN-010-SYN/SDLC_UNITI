# Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 2 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 21

## Files

- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PlatformConfig.java` (56 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PortalProperties.java` (66 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/AuditableEntity.java` (66 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/ReferenceGenerator.java` (64 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/StateMachine.java` (73 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/error/PortalException.java` (77 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/money/Money.java` (131 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUser.java` (66 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUserProvider.java` (73 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/Roles.java` (27 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/SecurityConfig.java` (115 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/CorrelationIdFilter.java` (69 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/GlobalExceptionHandler.java` (130 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/PageResponse.java` (42 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardController.java` (36 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardService.java` (116 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/PipelineKpis.java` (47 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/CompanyNameMatcher.java` (124 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflict.java` (97 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflictDetector.java` (93 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistration.java` (311 lines)

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PlatformConfig.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PlatformConfig.java`.

```java
package com.uniti.partnerportal.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Clock;
import java.util.Optional;

/**
 * Cross-cutting beans: a UTC clock (injected everywhere time matters so tests can freeze it),
 * the JPA auditor and the OpenAPI document metadata.
 */
@Configuration
public class PlatformConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    AuditorAware<String> auditorAware() {
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()) {
                return Optional.of("system");
            }
            return Optional.ofNullable(auth.getName());
        };
    }

    @Bean
    OpenAPI partnerPortalOpenApi() {
        String scheme = "bearer-jwt";
        return new OpenAPI()
                .info(new Info()
                        .title("Uniti Enterprise Partner Portal API")
                        .version("v1")
                        .description("Partner onboarding & KYC, lead and deal registration, quoting, "
                                + "ordering on behalf of customers, commissions, MDF and support cases."))
                .addSecurityItem(new SecurityRequirement().addList(scheme))
                .components(new Components().addSecuritySchemes(scheme, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PortalProperties.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/config/PortalProperties.java`.

```java
package com.uniti.partnerportal.common.config;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.Map;

/**
 * Strongly-typed view of the {@code partner-portal.*} configuration tree. Business tunables
 * (protection windows, approval thresholds, SLA targets) live here so they can be changed per
 * environment without a code change.
 */
@Validated
@ConfigurationProperties(prefix = "partner-portal")
public record PortalProperties(
        @NotNull Security security,
        @NotNull Cors cors,
        @NotNull Pricing pricing,
        @NotNull Deals deals,
        @NotNull Commissions commissions,
        @NotNull Mdf mdf,
        @NotNull Cases cases) {

    public record Security(@NotBlank String rolesClaim, @NotBlank String partnerClaim) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record Pricing(@NotBlank String defaultCurrency,
                          @Min(1) int quoteValidityDays,
                          @Min(0) int maxDiscountPercent) {
    }

    public record Deals(@Min(1) int protectionDays,
                        @Min(0) int extensionDays,
                        @Min(0) int maxExtensions,
                        @DecimalMin("0.5") @DecimalMax("1.0") double nameSimilarityThreshold) {
    }

    public record Commissions(@Min(0) int clawbackWindowDays,
                              @Min(0) int dealRegistrationUpliftBps,
                              @Min(0) long newLogoBonusMinor) {
    }

    public record Mdf(@Min(1) int claimWindowDays, @Min(1) int coOpSharePercent) {
    }

    public record Cases(Map<String, Integer> firstResponseHours, Map<String, Integer> resolutionHours) {

        public int firstResponseHoursFor(String priority) {
            return firstResponseHours.getOrDefault(priority, 24);
        }

        public int resolutionHoursFor(String priority) {
            return resolutionHours.getOrDefault(priority, 120);
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/AuditableEntity.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/AuditableEntity.java`.

```java
package com.uniti.partnerportal.common.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Version;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.Instant;

/**
 * Common audit columns and an optimistic-lock version for every aggregate root.
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @CreatedBy
    @Column(name = "created_by", updatable = false, length = 120)
    private String createdBy;

    @LastModifiedBy
    @Column(name = "updated_by", length = 120)
    private String updatedBy;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public long getVersion() {
        return version;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/ReferenceGenerator.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/ReferenceGenerator.java`.

```java
package com.uniti.partnerportal.common.domain;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Year;

/**
 * Issues human-friendly business references (e.g. {@code DR-2026-000042}) backed by database
 * sequences so they are unique across application instances.
 */
@Component
public class ReferenceGenerator {

    public enum Kind {
        PARTNER("PTR", "partner_ref_seq"),
        LEAD("LD", "lead_ref_seq"),
        DEAL("DR", "deal_ref_seq"),
        QUOTE("QT", "quote_ref_seq"),
        ORDER("ORD", "order_ref_seq"),
        STATEMENT("CS", "statement_ref_seq"),
        MDF_CLAIM("MDF", "mdf_claim_ref_seq"),
        CASE("CASE", "case_ref_seq"),
        ACCOUNT("ACC", "account_ref_seq");

        private final String prefix;
        private final String sequence;

        Kind(String prefix, String sequence) {
            this.prefix = prefix;
            this.sequence = sequence;
        }
    }

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ReferenceGenerator(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public String next(Kind kind) {
        Long value = jdbc.queryForObject("SELECT nextval('" + kind.sequence + "')", Long.class);
        long seq = value == null ? 0 : value;
        if (kind == Kind.ACCOUNT) {
            return format(Kind.ACCOUNT, seq, 0);
        }
        return format(kind, seq, Year.now(clock).getValue());
    }

    /**
     * Account numbers follow the platform convention {@code ACC-########}; every other reference
     * is year-scoped so it reads naturally on statements and quotes.
     */
    static String format(Kind kind, long seq, int year) {
        if (kind == Kind.ACCOUNT) {
            return String.format("ACC-%08d", seq);
        }
        return String.format("%s-%d-%06d", kind.prefix, year, seq);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/StateMachine.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/domain/StateMachine.java`.

```java
package com.uniti.partnerportal.common.domain;

import com.uniti.partnerportal.common.error.PortalException;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Declarative table of allowed transitions for a status enum. Each lifecycle (deal, quote,
 * order, claim, case) declares its graph once and every mutation is checked against it, so an
 * illegal jump is rejected consistently with a 409 rather than silently corrupting state.
 */
public final class StateMachine<S extends Enum<S>> {

    private final String entityName;
    private final Map<S, Set<S>> transitions;

    private StateMachine(String entityName, Map<S, Set<S>> transitions) {
        this.entityName = entityName;
        this.transitions = transitions;
    }

    public static <S extends Enum<S>> Builder<S> builder(String entityName, Class<S> type) {
        return new Builder<>(entityName, type);
    }

    public boolean canTransition(S from, S to) {
        return transitions.getOrDefault(from, Collections.emptySet()).contains(to);
    }

    public void assertTransition(S from, S to) {
        if (!canTransition(from, to)) {
            throw new PortalException.InvalidTransition(entityName, from, to);
        }
    }

    public Set<S> nextStates(S from) {
        return Collections.unmodifiableSet(transitions.getOrDefault(from, Collections.emptySet()));
    }

    public boolean isTerminal(S state) {
        return nextStates(state).isEmpty();
    }

    public static final class Builder<S extends Enum<S>> {
        private final String entityName;
        private final Class<S> type;
        private final Map<S, Set<S>> transitions;

        private Builder(String entityName, Class<S> type) {
            this.entityName = entityName;
            this.type = type;
            this.transitions = new EnumMap<>(type);
        }

        @SafeVarargs
        public final Builder<S> allow(S from, S... to) {
            Set<S> targets = transitions.computeIfAbsent(from, k -> EnumSet.noneOf(type));
            Collections.addAll(targets, to);
            return this;
        }

        public StateMachine<S> build() {
            Map<S, Set<S>> frozen = new EnumMap<>(type);
            transitions.forEach((k, v) -> frozen.put(k, Collections.unmodifiableSet(EnumSet.copyOf(v))));
            return new StateMachine<>(entityName, Collections.unmodifiableMap(frozen));
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/error/PortalException.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/error/PortalException.java`.

```java
package com.uniti.partnerportal.common.error;

import org.springframework.http.HttpStatus;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Base type for every business error raised by the services. Each carries a stable machine
 * readable {@code code} (used by the UI to pick a message) and the HTTP status it maps to.
 */
public abstract class PortalException extends RuntimeException {

    private final String code;
    private final HttpStatus status;
    private final Map<String, Object> details = new LinkedHashMap<>();

    protected PortalException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public PortalException withDetail(String key, Object value) {
        details.put(key, value);
        return this;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public Map<String, Object> getDetails() {
        return Collections.unmodifiableMap(details);
    }

    public static final class NotFound extends PortalException {
        public NotFound(String resource, Object id) {
            super(HttpStatus.NOT_FOUND, "resource.not_found", resource + " " + id + " was not found");
            withDetail("resource", resource);
            withDetail("id", String.valueOf(id));
        }
    }

    public static final class BusinessRule extends PortalException {
        public BusinessRule(String code, String message) {
            super(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
        }
    }

    public static final class Conflict extends PortalException {
        public Conflict(String code, String message) {
            super(HttpStatus.CONFLICT, code, message);
        }
    }

    public static final class Forbidden extends PortalException {
        public Forbidden(String message) {
            super(HttpStatus.FORBIDDEN, "access.forbidden", message);
        }
    }

    public static final class InvalidTransition extends PortalException {
        public InvalidTransition(String entity, Enum<?> from, Enum<?> to) {
            super(HttpStatus.CONFLICT, "state.invalid_transition",
                    entity + " cannot move from " + from + " to " + to);
            withDetail("from", from.name());
            withDetail("to", to.name());
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/money/Money.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/money/Money.java`.

```java
package com.uniti.partnerportal.common.money;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Immutable monetary amount in integer minor units (pence/cents) with an ISO-4217 currency.
 * All arithmetic that can produce fractions (percentages, basis points) rounds HALF_EVEN so
 * repeated calculations over many lines do not drift in either direction.
 */
public record Money(long amountMinor, String currency) implements Comparable<Money> {

    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);
    private static final BigDecimal TEN_THOUSAND = BigDecimal.valueOf(10_000);

    public Money {
        Objects.requireNonNull(currency, "currency");
        if (currency.length() != 3) {
            throw new IllegalArgumentException("Currency must be a 3-letter ISO code: " + currency);
        }
        currency = currency.toUpperCase();
    }

    public static Money of(long amountMinor, String currency) {
        return new Money(amountMinor, currency);
    }

    public static Money zero(String currency) {
        return new Money(0L, currency);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(amountMinor, other.amountMinor), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(amountMinor, other.amountMinor), currency);
    }

    public Money times(long factor) {
        return new Money(Math.multiplyExact(amountMinor, factor), currency);
    }

    public Money negate() {
        return new Money(-amountMinor, currency);
    }

    /**
     * Applies a percentage (e.g. 12.5 for 12.5%) and returns the resulting portion.
     */
    public Money percentage(BigDecimal percent) {
        BigDecimal result = BigDecimal.valueOf(amountMinor)
                .multiply(percent)
                .divide(ONE_HUNDRED, 0, RoundingMode.HALF_EVEN);
        return new Money(result.longValueExact(), currency);
    }

    /**
     * Applies basis points (1 bps = 0.01%) and returns the resulting portion.
     */
    public Money basisPoints(long bps) {
        BigDecimal result = BigDecimal.valueOf(amountMinor)
                .multiply(BigDecimal.valueOf(bps))
                .divide(TEN_THOUSAND, 0, RoundingMode.HALF_EVEN);
        return new Money(result.longValueExact(), currency);
    }

    public Money discountBy(BigDecimal percent) {
        return minus(percentage(percent));
    }

    public Money min(Money other) {
        requireSameCurrency(other);
        return amountMinor <= other.amountMinor ? this : other;
    }

    public Money max(Money other) {
        requireSameCurrency(other);
        return amountMinor >= other.amountMinor ? this : other;
    }

    @JsonIgnore
    public boolean isNegative() {
        return amountMinor < 0;
    }

    @JsonIgnore
    public boolean isZero() {
        return amountMinor == 0;
    }

    public boolean isGreaterThan(Money other) {
        requireSameCurrency(other);
        return amountMinor > other.amountMinor;
    }

    public boolean isLessThan(Money other) {
        requireSameCurrency(other);
        return amountMinor < other.amountMinor;
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(amountMinor, other.amountMinor);
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new CurrencyMismatchException(currency, other.currency);
        }
    }

    @Override
    public String toString() {
        BigDecimal major = BigDecimal.valueOf(amountMinor).movePointLeft(2);
        return currency + " " + major.toPlainString();
    }

    public static final class CurrencyMismatchException extends IllegalArgumentException {
        public CurrencyMismatchException(String left, String right) {
            super("Cannot combine amounts in " + left + " and " + right);
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUser.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUser.java`.

```java
package com.uniti.partnerportal.common.security;

import com.uniti.partnerportal.common.error.PortalException;

import java.util.Set;
import java.util.UUID;

/**
 * The authenticated caller, derived from the bearer JWT. Partner users are always bound to a
 * single partner organisation; internal Uniti users ({@code CHANNEL_MANAGER}, {@code SUPPORT_AGENT})
 * have no partner binding and may act across partners.
 */
public record CurrentUser(String subject, String email, String displayName, UUID partnerId, Set<String> roles) {

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isInternal() {
        return hasRole(Roles.CHANNEL_MANAGER) || hasRole(Roles.SUPPORT_AGENT);
    }

    public boolean isPartnerAdmin() {
        return hasRole(Roles.PARTNER_ADMIN);
    }

    /**
     * Returns the caller's partner, failing for internal users who must address a partner
     * explicitly.
     */
    public UUID requirePartnerId() {
        if (partnerId == null) {
            throw new PortalException.Forbidden("This action requires a partner-scoped user");
        }
        return partnerId;
    }

    /**
     * Resolves which partner a request acts on: partner users are pinned to their own partner
     * regardless of what they ask for; internal users must name one.
     */
    public UUID effectivePartner(UUID requested) {
        if (isInternal()) {
            if (requested == null) {
                throw new PortalException.BusinessRule("partner.required",
                        "Internal users must specify the partnerId to act on");
            }
            return requested;
        }
        UUID own = requirePartnerId();
        if (requested != null && !requested.equals(own)) {
            throw new PortalException.Forbidden("You may only act on your own partner organisation");
        }
        return own;
    }

    public void assertCanAccess(UUID ownerPartnerId) {
        if (isInternal()) {
            return;
        }
        if (partnerId == null || !partnerId.equals(ownerPartnerId)) {
            throw new PortalException.Forbidden("This record belongs to another partner");
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUserProvider.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/CurrentUserProvider.java`.

```java
package com.uniti.partnerportal.common.security;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.error.PortalException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Builds the {@link CurrentUser} for the active request from the JWT held in the security
 * context. Kept as a component (rather than a static helper) so services can be unit tested with
 * a mocked provider.
 */
@Component
public class CurrentUserProvider {

    private final PortalProperties properties;

    public CurrentUserProvider(PortalProperties properties) {
        this.properties = properties;
    }

    public CurrentUser get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken token)) {
            throw new PortalException.Forbidden("No authenticated user");
        }
        return fromJwt(token.getToken());
    }

    public CurrentUser fromJwt(Jwt jwt) {
        String partnerClaim = jwt.getClaimAsString(properties.security().partnerClaim());
        UUID partnerId = parsePartner(partnerClaim);
        Set<String> roles = extractRoles(jwt, properties.security().rolesClaim());
        String email = jwt.getClaimAsString("email");
        String name = jwt.getClaimAsString("name");
        return new CurrentUser(jwt.getSubject(), email, name == null ? email : name, partnerId, roles);
    }

    static Set<String> extractRoles(Jwt jwt, String claim) {
        Object raw = jwt.getClaims().get(claim);
        Set<String> roles = new HashSet<>();
        if (raw instanceof Collection<?> values) {
            values.forEach(v -> roles.add(String.valueOf(v).toUpperCase()));
        } else if (raw instanceof String value) {
            for (String part : value.split("[ ,]")) {
                if (!part.isBlank()) {
                    roles.add(part.trim().toUpperCase());
                }
            }
        }
        return roles;
    }

    private static UUID parsePartner(String claim) {
        if (claim == null || claim.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(claim);
        } catch (IllegalArgumentException ex) {
            throw new PortalException.Forbidden("Token carries a malformed partner identifier");
        }
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/Roles.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/Roles.java`.

```java
package com.uniti.partnerportal.common.security;

/**
 * Role names as they appear in the JWT {@code roles} claim. {@code PARTNER_ADMIN} and
 * {@code PARTNER_AGENT} are platform roles; {@code CHANNEL_MANAGER} is the Uniti-internal role
 * that onboards partners and approves deals, quotes and MDF claims. {@code SUPPORT_AGENT} works
 * partner support cases.
 */
public final class Roles {

    public static final String PARTNER_ADMIN = "PARTNER_ADMIN";
    public static final String PARTNER_AGENT = "PARTNER_AGENT";
    public static final String CHANNEL_MANAGER = "CHANNEL_MANAGER";
    public static final String SUPPORT_AGENT = "SUPPORT_AGENT";

    public static final String HAS_PARTNER_ROLE =
            "hasAnyRole('PARTNER_ADMIN','PARTNER_AGENT','CHANNEL_MANAGER')";
    public static final String HAS_PARTNER_ADMIN =
            "hasAnyRole('PARTNER_ADMIN','CHANNEL_MANAGER')";
    public static final String IS_CHANNEL_MANAGER = "hasRole('CHANNEL_MANAGER')";
    public static final String CAN_WORK_CASES =
            "hasAnyRole('PARTNER_ADMIN','PARTNER_AGENT','SUPPORT_AGENT','CHANNEL_MANAGER')";

    private Roles() {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/SecurityConfig.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/security/SecurityConfig.java`.

```java
package com.uniti.partnerportal.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.web.CorrelationIdFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.net.URI;
import java.util.Collection;
import java.util.List;

/**
 * Stateless JWT resource server. Coarse URL rules live here; fine-grained role checks are
 * declared with {@code @PreAuthorize} on each controller method, and record-level partner
 * isolation is enforced in the services via {@link CurrentUser}.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
                                            Converter<Jwt, AbstractAuthenticationToken> jwtConverter,
                                            CorsConfigurationSource corsConfigurationSource,
                                            ObjectMapper objectMapper) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/api/v1/openapi/**", "/api/v1/docs/**", "/swagger-ui/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/onboarding/applications").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter))
                        .authenticationEntryPoint(problemEntryPoint(objectMapper))
                        .accessDeniedHandler(problemAccessDenied(objectMapper)));
        return http.build();
    }

    @Bean
    Converter<Jwt, AbstractAuthenticationToken> jwtAuthenticationConverter(PortalProperties properties) {
        String claim = properties.security().rolesClaim();
        return jwt -> {
            Collection<GrantedAuthority> authorities = CurrentUserProvider.extractRoles(jwt, claim).stream()
                    .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role))
                    .toList();
            return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
        };
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(PortalProperties properties) {
        CorsConfiguration config = new CorsConfiguration();
        List<String> origins = properties.cors().allowedOrigins();
        config.setAllowedOrigins(origins == null ? List.of() : origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", CorrelationIdFilter.HEADER));
        config.setExposedHeaders(List.of(CorrelationIdFilter.HEADER, "Location"));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    private static AuthenticationEntryPoint problemEntryPoint(ObjectMapper mapper) {
        return (request, response, ex) -> {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,
                    "A valid bearer token is required");
            problem.setInstance(URI.create(request.getRequestURI()));
            problem.setProperty("code", "auth.unauthenticated");
            problem.setProperty("correlationId", CorrelationIdFilter.current());
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setHeader("WWW-Authenticate", "Bearer");
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), problem);
        };
    }

    private static AccessDeniedHandler problemAccessDenied(ObjectMapper mapper) {
        return (request, response, ex) -> {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                    "You do not have permission to perform this action");
            problem.setInstance(URI.create(request.getRequestURI()));
            problem.setProperty("code", "access.forbidden");
            problem.setProperty("correlationId", CorrelationIdFilter.current());
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), problem);
        };
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/CorrelationIdFilter.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/CorrelationIdFilter.java`.

```java
package com.uniti.partnerportal.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Accepts or mints an {@code X-Correlation-Id} for every request, exposes it through the MDC so
 * every structured log line carries it, and echoes it on the response so callers can quote it
 * when raising support tickets.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Correlation-Id";
    public static final String MDC_KEY = "correlationId";

    private static final Logger log = LoggerFactory.getLogger(CorrelationIdFilter.class);
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9._-]{8,64}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String correlationId = resolve(request.getHeader(HEADER));
        long started = System.nanoTime();
        MDC.put(MDC_KEY, correlationId);
        response.setHeader(HEADER, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            long elapsedMs = (System.nanoTime() - started) / 1_000_000;
            if (!request.getRequestURI().startsWith("/actuator")) {
                log.info("http_request method={} path={} status={} durationMs={}",
                        request.getMethod(), request.getRequestURI(), response.getStatus(), elapsedMs);
            }
            MDC.clear();
        }
    }

    /**
     * Inbound IDs are only trusted when they look like an ID; anything else (empty, oversized,
     * containing control characters that could forge log lines) is replaced with a fresh UUID.
     */
    static String resolve(String inbound) {
        if (inbound != null && SAFE_ID.matcher(inbound).matches()) {
            return inbound;
        }
        return UUID.randomUUID().toString();
    }

    public static String current() {
        String id = MDC.get(MDC_KEY);
        return id == null ? "unknown" : id;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/GlobalExceptionHandler.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/GlobalExceptionHandler.java`.

```java
package com.uniti.partnerportal.common.web;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.money.Money;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Translates every failure into an RFC 7807 {@code application/problem+json} body. Each problem
 * carries the correlation ID so a partner can quote it to the channel desk, and validation
 * failures enumerate the offending fields so forms can highlight them.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final String TYPE_BASE = "https://errors.uniti.example/partner-portal/";

    @ExceptionHandler(PortalException.class)
    public ProblemDetail handlePortal(PortalException ex, HttpServletRequest request) {
        ProblemDetail problem = base(ex.getStatus(), ex.getCode(), ex.getMessage(), request);
        ex.getDetails().forEach(problem::setProperty);
        if (ex.getStatus().is5xxServerError()) {
            log.error("portal_error code={}", ex.getCode(), ex);
        } else {
            log.info("portal_rejection code={} message={}", ex.getCode(), ex.getMessage());
        }
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        ProblemDetail problem = base(HttpStatus.BAD_REQUEST, "request.invalid",
                "One or more fields are invalid", request);
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::fieldError)
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleConstraint(ConstraintViolationException ex, HttpServletRequest request) {
        ProblemDetail problem = base(HttpStatus.BAD_REQUEST, "request.invalid",
                "One or more parameters are invalid", request);
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(v -> Map.of("field", v.getPropertyPath().toString(), "message", v.getMessage()))
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ProblemDetail handleUnreadable(Exception ex, HttpServletRequest request) {
        return base(HttpStatus.BAD_REQUEST, "request.malformed",
                "The request could not be read: " + rootMessage(ex), request);
    }

    @ExceptionHandler(Money.CurrencyMismatchException.class)
    public ProblemDetail handleCurrency(Money.CurrencyMismatchException ex, HttpServletRequest request) {
        return base(HttpStatus.UNPROCESSABLE_ENTITY, "money.currency_mismatch", ex.getMessage(), request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail handleOptimisticLock(OptimisticLockingFailureException ex, HttpServletRequest request) {
        return base(HttpStatus.CONFLICT, "resource.concurrent_modification",
                "The record was changed by someone else. Reload and try again.", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return base(HttpStatus.FORBIDDEN, "access.forbidden",
                "You do not have permission to perform this action", request);
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("unhandled_exception path={}", request.getRequestURI(), ex);
        return base(HttpStatus.INTERNAL_SERVER_ERROR, "internal.error",
                "An unexpected error occurred. Quote the correlation ID when contacting support.", request);
    }

    private static ProblemDetail base(HttpStatus status, String code, String detail, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create(TYPE_BASE + code.replace('.', '/')));
        problem.setTitle(status.getReasonPhrase());
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("correlationId", CorrelationIdFilter.current());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    private static Map<String, String> fieldError(FieldError error) {
        String message = error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage();
        return Map.of("field", error.getField(), "message", message);
    }

    private static String rootMessage(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        if (message == null) {
            return root.getClass().getSimpleName();
        }
        return message.length() > 200 ? message.substring(0, 200) : message;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/PageResponse.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/common/web/PageResponse.java`.

```java
package com.uniti.partnerportal.common.web;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.List;
import java.util.function.Function;

/**
 * Pagination envelope mandated by the platform API conventions:
 * {@code { items, page, pageSize, total }} with a 1-based page number on the wire.
 */
public record PageResponse<T>(List<T> items, int page, int pageSize, long total) {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;

    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements());
    }

    /**
     * Builds a {@link Pageable} from 1-based query parameters, clamping the page size so a client
     * cannot request an unbounded result set.
     */
    public static Pageable pageable(Integer page, Integer pageSize, Sort sort) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? DEFAULT_PAGE_SIZE : Math.min(pageSize, MAX_PAGE_SIZE);
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    public static Pageable pageable(Integer page, Integer pageSize) {
        return pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "createdAt"));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardController.java`.

```java
package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard", description = "Pipeline KPIs")
public class DashboardController {

    private final DashboardService service;
    private final CurrentUserProvider currentUser;

    public DashboardController(DashboardService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping("/pipeline")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Lead, deal, quote and order KPIs over a trailing window")
    public PipelineKpis pipeline(@RequestParam(required = false) UUID partnerId,
                                 @RequestParam(defaultValue = "90") int days) {
        return service.pipeline(partnerId, days, currentUser.get());
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/DashboardService.java`.

```java
package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationRepository;
import com.uniti.partnerportal.deals.DealStatus;
import com.uniti.partnerportal.leads.Lead;
import com.uniti.partnerportal.leads.LeadRepository;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.QuoteRepository;
import com.uniti.partnerportal.quotes.QuoteStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;

/**
 * Aggregates pipeline KPIs across leads, deal registrations, quotes and orders. All figures are
 * computed in the database; nothing here loads individual records.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    static final int MAX_WINDOW_DAYS = 730;

    private final LeadRepository leads;
    private final DealRegistrationRepository deals;
    private final QuoteRepository quotes;
    private final PartnerOrderRepository orders;
    private final PartnerService partners;
    private final Clock clock;

    public DashboardService(LeadRepository leads, DealRegistrationRepository deals, QuoteRepository quotes,
                            PartnerOrderRepository orders, PartnerService partners, Clock clock) {
        this.leads = leads;
        this.deals = deals;
        this.quotes = quotes;
        this.orders = orders;
        this.partners = partners;
        this.clock = clock;
    }

    public PipelineKpis pipeline(UUID requestedPartner, int windowDays, CurrentUser user) {
        if (windowDays < 1 || windowDays > MAX_WINDOW_DAYS) {
            throw new PortalException.BusinessRule("dashboard.invalid_window",
                    "The window must be between 1 and " + MAX_WINDOW_DAYS + " days");
        }
        UUID partnerId = user.effectivePartner(requestedPartner);
        Partner partner = partners.load(partnerId);
        Instant since = Instant.now(clock).minus(windowDays, ChronoUnit.DAYS);

        Map<Lead.Status, Long> leadCounts = new EnumMap<>(Lead.Status.class);
        for (Lead.Status status : Lead.Status.values()) {
            leadCounts.put(status, leads.countByPartnerIdAndStatus(partnerId, status));
        }

        Map<DealStatus, PipelineKpis.StageTotal> dealTotals = new EnumMap<>(DealStatus.class);
        deals.rollupByStatus(partnerId, since).forEach(r ->
                dealTotals.put(r.getStatus(), new PipelineKpis.StageTotal(r.getCount(), r.getMrc())));
        long openPipeline = DealStatus.CLAIMING.stream()
                .map(dealTotals::get)
                .filter(t -> t != null)
                .mapToLong(PipelineKpis.StageTotal::mrcMinor)
                .sum();

        Map<QuoteStatus, Long> quoteCounts = new EnumMap<>(QuoteStatus.class);
        for (QuoteStatus status : QuoteStatus.values()) {
            long count = quotes.countByPartnerIdAndStatusInAndCreatedAtAfter(partnerId, EnumSet.of(status), since);
            if (count > 0) {
                quoteCounts.put(status, count);
            }
        }

        Map<OrderStatus, PipelineKpis.StageTotal> orderTotals = new EnumMap<>(OrderStatus.class);
        orders.rollupByStatus(partnerId, since).forEach(r ->
                orderTotals.put(r.getStatus(), new PipelineKpis.StageTotal(r.getCount(), r.getMrc())));
        long inFlight = OrderStatus.IN_FLIGHT.stream()
                .map(orderTotals::get)
                .filter(t -> t != null)
                .mapToLong(PipelineKpis.StageTotal::count)
                .sum();

        return new PipelineKpis(
                partner.getCurrency(),
                since,
                leadCounts,
                leads.countByPartnerIdAndCreatedAtAfter(partnerId, since),
                PipelineKpis.rate(leadCounts.get(Lead.Status.CONVERTED), leadCounts.get(Lead.Status.DISQUALIFIED)),
                dealTotals,
                openPipeline,
                PipelineKpis.rate(count(dealTotals, DealStatus.WON), count(dealTotals, DealStatus.LOST)),
                quoteCounts,
                PipelineKpis.rate(
                        quoteCounts.getOrDefault(QuoteStatus.ACCEPTED, 0L) + quoteCounts.getOrDefault(QuoteStatus.ORDERED, 0L),
                        quoteCounts.getOrDefault(QuoteStatus.DECLINED, 0L) + quoteCounts.getOrDefault(QuoteStatus.EXPIRED, 0L)),
                orderTotals,
                inFlight,
                orders.sumActivatedMonthlyRecurring(partnerId, since));
    }

    private static long count(Map<DealStatus, PipelineKpis.StageTotal> totals, DealStatus status) {
        PipelineKpis.StageTotal total = totals.get(status);
        return total == null ? 0 : total.count();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/PipelineKpis.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/dashboard/PipelineKpis.java`.

```java
package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.deals.DealStatus;
import com.uniti.partnerportal.leads.Lead;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.quotes.QuoteStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;

/**
 * Pipeline health for one partner over a trailing window. Rates are percentages with one decimal
 * place and are {@code null} when there is no closed population to measure yet (so the UI can
 * show "n/a" rather than a misleading 0%).
 */
public record PipelineKpis(
        String currency,
        Instant windowStart,
        Map<Lead.Status, Long> leadsByStatus,
        long newLeads,
        BigDecimal leadConversionRate,
        Map<DealStatus, StageTotal> dealsByStatus,
        long openPipelineMrcMinor,
        BigDecimal dealWinRate,
        Map<QuoteStatus, Long> quotesByStatus,
        BigDecimal quoteAcceptanceRate,
        Map<OrderStatus, StageTotal> ordersByStatus,
        long ordersInFlight,
        long activatedMrcMinor) {

    public record StageTotal(long count, long mrcMinor) {
    }

    /**
     * {@code wins / (wins + losses)} as a percentage, or null when nothing has closed.
     */
    static BigDecimal rate(long wins, long losses) {
        long closed = wins + losses;
        if (closed == 0) {
            return null;
        }
        return BigDecimal.valueOf(wins * 100L).divide(BigDecimal.valueOf(closed), 1, RoundingMode.HALF_EVEN);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/CompanyNameMatcher.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/CompanyNameMatcher.java`.

```java
package com.uniti.partnerportal.deals;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Normalises and compares business names so that "The Acme Widgets Ltd." and
 * "ACME WIDGETS LIMITED" are recognised as the same customer, while staying conservative enough
 * that unrelated companies sharing a common word are not flagged.
 */
public final class CompanyNameMatcher {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9 ]");
    private static final Pattern MULTI_SPACE = Pattern.compile("\\s+");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}");
    private static final Set<String> NOISE_WORDS = Set.of(
            "the", "ltd", "limited", "plc", "llp", "lp", "inc", "incorporated", "co", "company",
            "corp", "corporation", "group", "holdings", "uk", "gb", "and");
    private static final Set<String> GENERIC_EMAIL_DOMAINS = Set.of(
            "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
            "yahoo.com", "yahoo.co.uk", "icloud.com", "aol.com", "btinternet.com", "sky.com", "protonmail.com");

    private CompanyNameMatcher() {
    }

    public static String normalise(String name) {
        if (name == null) {
            return "";
        }
        String folded = DIACRITICS.matcher(Normalizer.normalize(name, Normalizer.Form.NFD)).replaceAll("");
        String lower = folded.toLowerCase(Locale.ROOT).replace("&", " and ");
        String cleaned = NON_ALNUM.matcher(lower).replaceAll(" ");
        StringBuilder out = new StringBuilder();
        for (String token : MULTI_SPACE.split(cleaned.trim())) {
            if (!token.isEmpty() && !NOISE_WORDS.contains(token)) {
                if (!out.isEmpty()) {
                    out.append(' ');
                }
                out.append(token);
            }
        }
        return out.toString();
    }

    /**
     * Similarity in [0,1] based on Levenshtein distance over the normalised names.
     */
    public static double similarity(String a, String b) {
        String left = normalise(a);
        String right = normalise(b);
        if (left.isEmpty() || right.isEmpty()) {
            return 0.0;
        }
        if (left.equals(right)) {
            return 1.0;
        }
        int distance = levenshtein(left, right);
        return 1.0 - (double) distance / Math.max(left.length(), right.length());
    }

    static int levenshtein(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }

    /**
     * Extracts the registrable domain from an email address or website, ignoring free mail
     * providers which say nothing about the customer's identity.
     */
    public static String customerDomain(String emailOrUrl) {
        if (emailOrUrl == null || emailOrUrl.isBlank()) {
            return null;
        }
        String value = emailOrUrl.trim().toLowerCase(Locale.ROOT);
        int at = value.lastIndexOf('@');
        if (at >= 0) {
            value = value.substring(at + 1);
        } else {
            value = value.replaceFirst("^https?://", "");
            int slash = value.indexOf('/');
            if (slash >= 0) {
                value = value.substring(0, slash);
            }
        }
        if (value.startsWith("www.")) {
            value = value.substring(4);
        }
        if (value.isEmpty() || !value.contains(".") || GENERIC_EMAIL_DOMAINS.contains(value)) {
            return null;
        }
        return value;
    }

    /**
     * UK postcode outward code ("SW1A 1AA" -> "SW1A"), which identifies the district.
     */
    public static String outwardCode(String postcode) {
        if (postcode == null || postcode.isBlank()) {
            return null;
        }
        String compact = postcode.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (compact.length() <= 3) {
            return compact;
        }
        return compact.substring(0, compact.length() - 3);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflict.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflict.java`.

```java
package com.uniti.partnerportal.deals;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * A recorded overlap between a new registration and an existing claim on the same customer
 * by a different partner. Kept for audit even after the decision is made.
 */
@Entity
@Table(name = "deal_conflict")
public class DealConflict {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "deal_id")
    private DealRegistration deal;

    @Column(name = "conflicting_deal_id", nullable = false)
    private UUID conflictingDealId;

    @Column(name = "conflicting_partner_id", nullable = false)
    private UUID conflictingPartnerId;

    @Column(name = "conflicting_reference", nullable = false, length = 20)
    private String conflictingReference;

    @Column(name = "match_reasons", nullable = false, length = 300)
    private String matchReasons;

    @Column(name = "score", nullable = false)
    private int score;

    @Column(name = "detected_at", nullable = false)
    private Instant detectedAt;

    protected DealConflict() {
    }

    public DealConflict(UUID id, UUID conflictingDealId, UUID conflictingPartnerId, String conflictingReference,
                        String matchReasons, int score, Instant detectedAt) {
        this.id = id;
        this.conflictingDealId = conflictingDealId;
        this.conflictingPartnerId = conflictingPartnerId;
        this.conflictingReference = conflictingReference;
        this.matchReasons = matchReasons;
        this.score = score;
        this.detectedAt = detectedAt;
    }

    void setDeal(DealRegistration deal) {
        this.deal = deal;
    }

    public UUID getId() {
        return id;
    }

    public DealRegistration getDeal() {
        return deal;
    }

    public UUID getConflictingDealId() {
        return conflictingDealId;
    }

    public UUID getConflictingPartnerId() {
        return conflictingPartnerId;
    }

    public String getConflictingReference() {
        return conflictingReference;
    }

    public String getMatchReasons() {
        return matchReasons;
    }

    public int getScore() {
        return score;
    }

    public Instant getDetectedAt() {
        return detectedAt;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflictDetector.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealConflictDetector.java`.

```java
package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.config.PortalProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Scores how likely two registrations refer to the same end customer.
 *
 * <table>
 *   <tr><th>Signal</th><th>Points</th></tr>
 *   <tr><td>Same company registration number</td><td>100</td></tr>
 *   <tr><td>Same corporate email/web domain</td><td>80</td></tr>
 *   <tr><td>Identical normalised name</td><td>70</td></tr>
 *   <tr><td>Similar name (above threshold)</td><td>50</td></tr>
 *   <tr><td>Same postcode district</td><td>20</td></tr>
 * </table>
 * A pair scoring {@value #MATCH_THRESHOLD} or more is a conflict. A similar name on its own is
 * therefore not enough; it needs the same district (or a stronger identifier) to corroborate it.
 */
@Component
public class DealConflictDetector {

    public static final int MATCH_THRESHOLD = 70;

    public enum Reason { COMPANY_NUMBER, DOMAIN, EXACT_NAME, SIMILAR_NAME, SAME_DISTRICT }

    public record Match(DealRegistration existing, Set<Reason> reasons, int score) {

        public String reasonsAsText() {
            return String.join(",", reasons.stream().map(Enum::name).toList());
        }
    }

    private final double similarityThreshold;

    public DealConflictDetector(PortalProperties properties) {
        this(properties.deals().nameSimilarityThreshold());
    }

    DealConflictDetector(double similarityThreshold) {
        this.similarityThreshold = similarityThreshold;
    }

    public List<Match> detect(DealRegistration candidate, List<DealRegistration> existing) {
        List<Match> matches = new ArrayList<>();
        for (DealRegistration other : existing) {
            if (other.getId().equals(candidate.getId())) {
                continue;
            }
            Match match = score(candidate, other);
            if (match.score() >= MATCH_THRESHOLD) {
                matches.add(match);
            }
        }
        matches.sort(Comparator.comparingInt(Match::score).reversed()
                .thenComparing(m -> m.existing().getSubmittedAt()));
        return matches;
    }

    Match score(DealRegistration a, DealRegistration b) {
        Set<Reason> reasons = new LinkedHashSet<>();
        int score = 0;
        if (a.getCustomerCompanyNumber() != null
                && a.getCustomerCompanyNumber().equalsIgnoreCase(Objects.toString(b.getCustomerCompanyNumber(), ""))) {
            reasons.add(Reason.COMPANY_NUMBER);
            score += 100;
        }
        if (a.getCustomerDomain() != null && a.getCustomerDomain().equals(b.getCustomerDomain())) {
            reasons.add(Reason.DOMAIN);
            score += 80;
        }
        if (!a.getNormalisedName().isEmpty() && a.getNormalisedName().equals(b.getNormalisedName())) {
            reasons.add(Reason.EXACT_NAME);
            score += 70;
        } else if (CompanyNameMatcher.similarity(a.getCustomerName(), b.getCustomerName()) >= similarityThreshold) {
            reasons.add(Reason.SIMILAR_NAME);
            score += 50;
        }
        if (a.getOutwardCode() != null && a.getOutwardCode().equals(b.getOutwardCode())) {
            reasons.add(Reason.SAME_DISTRICT);
            score += 20;
        }
        return new Match(b, reasons, score);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistration.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistration.java`.

```java
package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "deal_registration")
public class DealRegistration extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "lead_id")
    private UUID leadId;

    @Column(name = "registered_by", nullable = false, length = 120)
    private String registeredBy;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Column(name = "normalised_name", nullable = false, length = 200)
    private String normalisedName;

    @Column(name = "customer_company_number", length = 20)
    private String customerCompanyNumber;

    @Column(name = "customer_domain", length = 200)
    private String customerDomain;

    @Column(name = "customer_postcode", nullable = false, length = 10)
    private String customerPostcode;

    @Column(name = "outward_code", nullable = false, length = 6)
    private String outwardCode;

    @Column(name = "contact_name", nullable = false, length = 120)
    private String contactName;

    @Column(name = "contact_email", nullable = false, length = 200)
    private String contactEmail;

    @Column(name = "site_count", nullable = false)
    private int siteCount;

    @Column(name = "estimated_mrc_minor", nullable = false)
    private long estimatedMrcMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "expected_close_date", nullable = false)
    private LocalDate expectedCloseDate;

    @Column(name = "product_interest", nullable = false, length = 200)
    private String productInterest;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DealStatus status;

    @Column(name = "has_conflict", nullable = false)
    private boolean hasConflict;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decided_by", length = 120)
    private String decidedBy;

    @Column(name = "decision_reason", length = 500)
    private String decisionReason;

    @Column(name = "protected_until")
    private LocalDate protectedUntil;

    @Column(name = "extensions_used", nullable = false)
    private int extensionsUsed;

    @OneToMany(mappedBy = "deal", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<DealConflict> conflicts = new ArrayList<>();

    protected DealRegistration() {
    }

    public DealRegistration(UUID id, String reference, UUID partnerId, String registeredBy, Instant submittedAt) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.registeredBy = registeredBy;
        this.submittedAt = submittedAt;
        this.status = DealStatus.SUBMITTED;
    }

    public void transitionTo(DealStatus next) {
        DealStatus.LIFECYCLE.assertTransition(status, next);
        this.status = next;
    }

    public void decide(DealStatus outcome, String by, String reason, Instant at) {
        transitionTo(outcome);
        this.decidedBy = by;
        this.decisionReason = reason;
        this.decidedAt = at;
    }

    public void addConflict(DealConflict conflict) {
        conflict.setDeal(this);
        conflicts.add(conflict);
        hasConflict = true;
    }

    public void clearConflicts() {
        conflicts.clear();
        hasConflict = false;
    }

    public boolean isProtectedOn(LocalDate date) {
        return status == DealStatus.APPROVED && protectedUntil != null && !protectedUntil.isBefore(date);
    }

    public void extendProtection(int days) {
        this.protectedUntil = protectedUntil.plusDays(days);
        this.extensionsUsed++;
    }

    public UUID getId() {
        return id;
    }

    public String getReference() {
        return reference;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public UUID getLeadId() {
        return leadId;
    }

    public void setLeadId(UUID leadId) {
        this.leadId = leadId;
    }

    public String getRegisteredBy() {
        return registeredBy;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
        this.normalisedName = CompanyNameMatcher.normalise(customerName);
    }

    public String getNormalisedName() {
        return normalisedName;
    }

    public String getCustomerCompanyNumber() {
        return customerCompanyNumber;
    }

    public void setCustomerCompanyNumber(String customerCompanyNumber) {
        this.customerCompanyNumber = customerCompanyNumber;
    }

    public String getCustomerDomain() {
        return customerDomain;
    }

    public void setCustomerDomain(String customerDomain) {
        this.customerDomain = customerDomain;
    }

    public String getCustomerPostcode() {
        return customerPostcode;
    }

    public void setCustomerPostcode(String customerPostcode) {
        this.customerPostcode = customerPostcode;
        this.outwardCode = CompanyNameMatcher.outwardCode(customerPostcode);
    }

    public String getOutwardCode() {
        return outwardCode;
    }

    public String getContactName() {
        return contactName;
    }

    public void setContactName(String contactName) {
        this.contactName = contactName;
    }

    public String getContactEmail() {
        return contactEmail;
    }

    public void setContactEmail(String contactEmail) {
        this.contactEmail = contactEmail;
    }

    public int getSiteCount() {
        return siteCount;
    }

    public void setSiteCount(int siteCount) {
        this.siteCount = siteCount;
    }

    public long getEstimatedMrcMinor() {
        return estimatedMrcMinor;
    }

    public void setEstimatedMrcMinor(long estimatedMrcMinor) {
        this.estimatedMrcMinor = estimatedMrcMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public LocalDate getExpectedCloseDate() {
        return expectedCloseDate;
    }

    public void setExpectedCloseDate(LocalDate expectedCloseDate) {
        this.expectedCloseDate = expectedCloseDate;
    }

    public String getProductInterest() {
        return productInterest;
    }

    public void setProductInterest(String productInterest) {
        this.productInterest = productInterest;
    }

    public DealStatus getStatus() {
        return status;
    }

    public boolean isHasConflict() {
        return hasConflict;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    public String getDecisionReason() {
        return decisionReason;
    }

    public LocalDate getProtectedUntil() {
        return protectedUntil;
    }

    public void setProtectedUntil(LocalDate protectedUntil) {
        this.protectedUntil = protectedUntil;
    }

    public int getExtensionsUsed() {
        return extensionsUsed;
    }

    public List<DealConflict> getConflicts() {
        return conflicts;
    }
}
```

# Enterprise Partner Portal: apps/enterprise-partner-portal/backend (part 1 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 19

## Files

- `apps/enterprise-partner-portal/backend/.env.example` (11 lines)
- `apps/enterprise-partner-portal/backend/pom.xml` (106 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/PartnerPortalApplication.java` (19 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogController.java` (66 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProduct.java` (131 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProductRepository.java` (18 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionCalculator.java` (93 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionController.java` (200 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntry.java` (144 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntryRepository.java` (40 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayout.java` (139 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayoutRepository.java` (41 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRule.java` (140 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRuleRepository.java` (26 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionService.java` (385 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatement.java` (233 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatementRepository.java` (29 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/StatementStatus.java` (34 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/dto/CommissionDtos.java` (99 lines)

## apps/enterprise-partner-portal/backend/.env.example

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: bash. Path: `apps/enterprise-partner-portal/backend/.env.example`.

```bash
PORT=8080
DB_URL=jdbc:postgresql://localhost:5432/partner_portal
DB_USERNAME=partner_portal
DB_PASSWORD=
DB_POOL_SIZE=10
OIDC_ISSUER_URI=https://login.uniti.example/realms/partners
OIDC_AUDIENCE=enterprise-partner-portal
JWT_ROLES_CLAIM=roles
JWT_PARTNER_CLAIM=partner_id
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

## apps/enterprise-partner-portal/backend/pom.xml

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: xml. Path: `apps/enterprise-partner-portal/backend/pom.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>com.uniti</groupId>
    <artifactId>enterprise-partner-portal</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>Uniti Enterprise Partner Portal API</name>
    <description>Partner onboarding, deal registration, quoting, ordering, commissions and MDF for Uniti channel partners</description>

    <properties>
        <java.version>17</java.version>
        <springdoc.version>2.5.0</springdoc.version>
        <logstash-encoder.version>7.4</logstash-encoder.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>${springdoc.version}</version>
        </dependency>
        <dependency>
            <groupId>net.logstash.logback</groupId>
            <artifactId>logstash-logback-encoder</artifactId>
            <version>${logstash-encoder.version}</version>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <includes>
                        <include>**/*Test.java</include>
                    </includes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/PartnerPortalApplication.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/PartnerPortalApplication.java`.

```java
package com.uniti.partnerportal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableJpaAuditing
@EnableScheduling
public class PartnerPortalApplication {

    public static void main(String[] args) {
        SpringApplication.run(PartnerPortalApplication.class, args);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogController.java`.

```java
package com.uniti.partnerportal.catalog;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/catalog")
@Tag(name = "Catalog", description = "Products available to sell through the channel")
public class CatalogController {

    /**
     * Partners see list prices and minimum terms. Floor prices are commercially sensitive and are
     * exposed only to internal users.
     */
    public record ProductResponse(UUID id, String sku, String name, CatalogProduct.Category category,
                                  Integer bandwidthMbps, long monthlyPriceMinor, long installPriceMinor,
                                  int minTermMonths, boolean perSite, String currency) {

        static ProductResponse from(CatalogProduct p) {
            return new ProductResponse(p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getBandwidthMbps(),
                    p.getMonthlyPriceMinor(), p.getInstallPriceMinor(), p.getMinTermMonths(), p.isPerSite(),
                    p.getCurrency());
        }
    }

    private final CatalogProductRepository products;

    public CatalogController(CatalogProductRepository products) {
        this.products = products;
    }

    @GetMapping("/products")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "List active products")
    public List<ProductResponse> list(@RequestParam(required = false) CatalogProduct.Category category) {
        return products.findByActiveTrue().stream()
                .filter(p -> category == null || p.getCategory() == category)
                .sorted(Comparator.comparing(CatalogProduct::getCategory)
                        .thenComparing(p -> p.getBandwidthMbps() == null ? 0 : p.getBandwidthMbps())
                        .thenComparing(CatalogProduct::getSku))
                .map(ProductResponse::from)
                .toList();
    }

    @GetMapping("/products/{sku}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public ProductResponse get(@PathVariable String sku) {
        return products.findBySku(sku)
                .filter(CatalogProduct::isActive)
                .map(ProductResponse::from)
                .orElseThrow(() -> new PortalException.NotFound("Product", sku));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProduct.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProduct.java`.

```java
package com.uniti.partnerportal.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * A sellable product as offered to the channel. The floor price is the lowest net monthly
 * price Uniti will accept after all discounts; no approval can go below it.
 */
@Entity
@Table(name = "catalog_product")
public class CatalogProduct {

    public enum Category { BROADBAND, VOICE, SDWAN, HOSTED, ADD_ON }

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 40)
    private String sku;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Category category;

    @Column(name = "bandwidth_mbps")
    private Integer bandwidthMbps;

    @Column(name = "monthly_price_minor", nullable = false)
    private long monthlyPriceMinor;

    @Column(name = "install_price_minor", nullable = false)
    private long installPriceMinor;

    @Column(name = "floor_monthly_price_minor", nullable = false)
    private long floorMonthlyPriceMinor;

    @Column(name = "min_term_months", nullable = false)
    private int minTermMonths;

    @Column(name = "per_site", nullable = false)
    private boolean perSite;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false)
    private boolean active;

    protected CatalogProduct() {
    }

    public CatalogProduct(UUID id, String sku, String name, Category category, Integer bandwidthMbps,
                          long monthlyPriceMinor, long installPriceMinor, long floorMonthlyPriceMinor,
                          int minTermMonths, boolean perSite, String currency) {
        this.id = id;
        this.sku = sku;
        this.name = name;
        this.category = category;
        this.bandwidthMbps = bandwidthMbps;
        this.monthlyPriceMinor = monthlyPriceMinor;
        this.installPriceMinor = installPriceMinor;
        this.floorMonthlyPriceMinor = floorMonthlyPriceMinor;
        this.minTermMonths = minTermMonths;
        this.perSite = perSite;
        this.currency = currency;
        this.active = true;
    }

    public UUID getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public Category getCategory() {
        return category;
    }

    public Integer getBandwidthMbps() {
        return bandwidthMbps;
    }

    public long getMonthlyPriceMinor() {
        return monthlyPriceMinor;
    }

    public long getInstallPriceMinor() {
        return installPriceMinor;
    }

    public long getFloorMonthlyPriceMinor() {
        return floorMonthlyPriceMinor;
    }

    public int getMinTermMonths() {
        return minTermMonths;
    }

    public boolean isPerSite() {
        return perSite;
    }

    public String getCurrency() {
        return currency;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProductRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/catalog/CatalogProductRepository.java`.

```java
package com.uniti.partnerportal.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CatalogProductRepository extends JpaRepository<CatalogProduct, UUID> {

    List<CatalogProduct> findByActiveTrue();

    Optional<CatalogProduct> findBySku(String sku);

    List<CatalogProduct> findBySkuIn(Collection<String> skus);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionCalculator.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionCalculator.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.money.Money;
import com.uniti.partnerportal.partner.PartnerTier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Computes the upfront commission earned when an order goes live. Pure and deterministic.
 *
 * <h2>Basis</h2>
 * First-year value (FYV) = net monthly recurring charge x min(term, 12). One-off charges never
 * earn commission.
 *
 * <h2>Components</h2>
 * <ol>
 *   <li><b>BASE</b>: FYV x the partner tier's commission rate.</li>
 *   <li><b>DEAL_REGISTRATION</b>: FYV x the registration uplift when the order came from an
 *       approved deal registration.</li>
 *   <li><b>NEW_LOGO</b>: flat bonus when the order created a new customer account.</li>
 *   <li><b>RULE</b>: each effective incentive rule pays its rate on the FYV of the sites it
 *       covers, plus its flat bonus once per order if at least one site qualifies.</li>
 * </ol>
 */
@Component
public class CommissionCalculator {

    static final int FIRST_YEAR_MONTHS = 12;

    public record SiteBasis(CatalogProduct.Category category, long netMrcMinor) {
    }

    public record OrderBasis(String currency, int termMonths, boolean dealRegistered, boolean newLogo,
                             List<SiteBasis> sites) {
    }

    public record Line(String component, String description, Money amount) {
    }

    public record Result(Money firstYearValue, List<Line> lines, Money total) {
    }

    public Result calculate(OrderBasis order, PartnerTier tier, List<CommissionRule> effectiveRules,
                            PortalProperties.Commissions config) {
        String ccy = order.currency();
        int months = Math.min(order.termMonths(), FIRST_YEAR_MONTHS);
        Money fyv = order.sites().stream()
                .map(s -> Money.of(s.netMrcMinor(), ccy).times(months))
                .reduce(Money.zero(ccy), Money::plus);

        List<Line> lines = new ArrayList<>();
        add(lines, "BASE", tier + " tier rate " + bpsAsPercent(tier.commissionRateBps()),
                fyv.basisPoints(tier.commissionRateBps()));
        if (order.dealRegistered()) {
            add(lines, "DEAL_REGISTRATION", "Registered deal uplift " + bpsAsPercent(config.dealRegistrationUpliftBps()),
                    fyv.basisPoints(config.dealRegistrationUpliftBps()));
        }
        if (order.newLogo()) {
            add(lines, "NEW_LOGO", "New customer bonus", Money.of(config.newLogoBonusMinor(), ccy));
        }
        for (CommissionRule rule : effectiveRules) {
            if (!rule.getCurrency().equals(ccy) || !rule.eligible(tier, order.termMonths())) {
                continue;
            }
            List<SiteBasis> covered = order.sites().stream().filter(s -> rule.covers(s.category())).toList();
            if (covered.isEmpty()) {
                continue;
            }
            Money coveredFyv = covered.stream()
                    .map(s -> Money.of(s.netMrcMinor(), ccy).times(months))
                    .reduce(Money.zero(ccy), Money::plus);
            Money amount = coveredFyv.basisPoints(rule.getRateBps()).plus(Money.of(rule.getFlatBonusMinor(), ccy));
            add(lines, "RULE", rule.getName(), amount);
        }
        Money total = lines.stream().map(Line::amount).reduce(Money.zero(ccy), Money::plus);
        return new Result(fyv, List.copyOf(lines), total);
    }

    private static void add(List<Line> lines, String component, String description, Money amount) {
        if (!amount.isZero()) {
            lines.add(new Line(component, description, amount));
        }
    }

    static String bpsAsPercent(int bps) {
        return (bps / 100) + "." + String.format("%02d", bps % 100) + "%";
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionController.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.commissions.dto.CommissionDtos.AdjustmentRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionSummaryResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.DisputeRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.EntryResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.GenerateStatementRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutFailedRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutPaidRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.StatementDetailResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.StatementResponse;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/commissions")
@Tag(name = "Commissions", description = "Commission rules, monthly statements and payouts")
public class CommissionController {

    private final CommissionService service;
    private final CurrentUserProvider currentUser;

    public CommissionController(CommissionService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping("/summary")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Year-to-date earnings, unbilled balance and outstanding payouts")
    public CommissionSummaryResponse summary(@RequestParam(required = false) UUID partnerId) {
        return service.summary(partnerId, currentUser.get());
    }

    @GetMapping("/statements")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    public PageResponse<StatementResponse> statements(@RequestParam(required = false) UUID partnerId,
                                                      @RequestParam(required = false) StatementStatus status,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "periodStart"));
        return PageResponse.from(service.searchStatements(partnerId, status, pageable, currentUser.get()),
                this::toStatementResponse);
    }

    @GetMapping("/statements/{statementId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Statement with its ledger entries and payout")
    public StatementDetailResponse statement(@PathVariable UUID statementId) {
        return detail(service.getStatement(statementId, currentUser.get()));
    }

    @PostMapping("/statements")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Generate a statement for a closed month")
    public StatementDetailResponse generate(@Valid @RequestBody GenerateStatementRequest request) {
        CommissionStatement statement = service.generateStatement(request.partnerId(), request.period())
                .orElseThrow(() -> new PortalException.BusinessRule("commission.nothing_to_bill",
                        "There are no unbilled commission entries for " + request.period()));
        return detail(statement);
    }

    @PostMapping("/statements/{statementId}/issue")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementResponse issue(@PathVariable UUID statementId) {
        return toStatementResponse(service.issue(statementId));
    }

    @PostMapping("/statements/{statementId}/dispute")
    @PreAuthorize("hasRole('PARTNER_ADMIN')")
    @Operation(summary = "Dispute an issued statement")
    public StatementResponse dispute(@PathVariable UUID statementId, @Valid @RequestBody DisputeRequest request) {
        return toStatementResponse(service.dispute(statementId, request.reason(), currentUser.get()));
    }

    @PostMapping("/statements/{statementId}/adjustments")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementDetailResponse adjust(@PathVariable UUID statementId,
                                          @Valid @RequestBody AdjustmentRequest request) {
        CurrentUser user = currentUser.get();
        return detail(service.adjust(statementId, request.amountMinor(), request.description(), user));
    }

    @PostMapping("/statements/{statementId}/reissue")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementResponse reissue(@PathVariable UUID statementId) {
        return toStatementResponse(service.reissue(statementId));
    }

    @PostMapping("/statements/{statementId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Approve for payment, or carry forward if below the payout minimum")
    public StatementDetailResponse approve(@PathVariable UUID statementId) {
        return detail(service.approve(statementId, currentUser.get()));
    }

    @GetMapping("/payouts")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    public PageResponse<PayoutResponse> payouts(@RequestParam(required = false) UUID partnerId,
                                                @RequestParam(required = false) CommissionPayout.Status status,
                                                @RequestParam(required = false) Integer page,
                                                @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "scheduledFor"));
        return PageResponse.from(service.searchPayouts(partnerId, status, pageable, currentUser.get()),
                CommissionController::toPayoutResponse);
    }

    @PostMapping("/payouts/{payoutId}/paid")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse paid(@PathVariable UUID payoutId, @Valid @RequestBody PayoutPaidRequest request) {
        return toPayoutResponse(service.markPayoutPaid(payoutId, request.paymentReference()));
    }

    @PostMapping("/payouts/{payoutId}/failed")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse failed(@PathVariable UUID payoutId, @Valid @RequestBody PayoutFailedRequest request) {
        return toPayoutResponse(service.markPayoutFailed(payoutId, request.reason()));
    }

    @PostMapping("/payouts/{payoutId}/reschedule")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse reschedule(@PathVariable UUID payoutId) {
        return toPayoutResponse(service.reschedulePayout(payoutId));
    }

    @GetMapping("/rules")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Incentive rules currently or formerly on offer")
    public PageResponse<CommissionRuleResponse> rules(@RequestParam(defaultValue = "true") boolean active,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by("validFrom").descending());
        return PageResponse.from(service.listRules(active, pageable), CommissionController::toRuleResponse);
    }

    @PostMapping("/rules")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public CommissionRuleResponse createRule(@Valid @RequestBody CommissionRuleRequest request) {
        return toRuleResponse(service.createRule(request));
    }

    @PostMapping("/rules/{ruleId}/deactivate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public CommissionRuleResponse deactivateRule(@PathVariable UUID ruleId) {
        return toRuleResponse(service.deactivateRule(ruleId));
    }

    private StatementDetailResponse detail(CommissionStatement s) {
        var lines = service.statementEntries(s.getId()).stream()
                .map(e -> new EntryResponse(e.getId(), e.getOrderId(), e.getOrderReference(), e.getType(),
                        e.getComponent(), e.getDescription(), e.getAmountMinor(), e.getCurrency(), e.getEarnedOn()))
                .toList();
        PayoutResponse payout = service.statementPayout(s.getId()).map(CommissionController::toPayoutResponse).orElse(null);
        return new StatementDetailResponse(toStatementResponse(s), lines, payout);
    }

    private StatementResponse toStatementResponse(CommissionStatement s) {
        return new StatementResponse(s.getId(), s.getReference(), s.getPartnerId(), s.getPeriodStart(),
                s.getPeriodEnd(), s.getCurrency(), s.getStatus(), s.getAccruedMinor(), s.getClawbackMinor(),
                s.getAdjustmentMinor(), s.getBroughtForwardMinor(), s.getNetPayableMinor(), s.getIssuedAt(),
                s.getDisputeReason(), s.getDecidedAt(), s.getPaidAt(), service.isDisputable(s));
    }

    private static PayoutResponse toPayoutResponse(CommissionPayout p) {
        return new PayoutResponse(p.getId(), p.getStatementId(), p.getPartnerId(), p.getAmountMinor(),
                p.getCurrency(), p.getStatus(), p.getScheduledFor(), p.getPaymentReference(), p.getPaidAt(),
                p.getFailureReason());
    }

    private static CommissionRuleResponse toRuleResponse(CommissionRule r) {
        return new CommissionRuleResponse(r.getId(), r.getName(), r.getProductCategory(), r.getMinTier(),
                r.getMinTermMonths(), r.getRateBps(), r.getFlatBonusMinor(), r.getCurrency(), r.getValidFrom(),
                r.getValidTo(), r.isActive());
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntry.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntry.java`.

```java
package com.uniti.partnerportal.commissions;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Immutable line in a partner's commission ledger. Accruals are positive, clawbacks negative and
 * adjustments either. An entry is swept onto exactly one statement; corrections are new entries,
 * never edits.
 */
@Entity
@Table(name = "commission_entry")
public class CommissionEntry {

    public enum Type { ACCRUAL, CLAWBACK, ADJUSTMENT }

    @Id
    private UUID id;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "order_id")
    private UUID orderId;

    @Column(name = "order_reference", length = 20)
    private String orderReference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    @Column(nullable = false, length = 40)
    private String component;

    @Column(nullable = false, length = 300)
    private String description;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "earned_on", nullable = false)
    private LocalDate earnedOn;

    @Column(name = "statement_id")
    private UUID statementId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by", nullable = false, length = 120)
    private String createdBy;

    protected CommissionEntry() {
    }

    public CommissionEntry(UUID id, UUID partnerId, UUID orderId, String orderReference, Type type, String component,
                           String description, long amountMinor, String currency, LocalDate earnedOn,
                           Instant createdAt, String createdBy) {
        this.id = id;
        this.partnerId = partnerId;
        this.orderId = orderId;
        this.orderReference = orderReference;
        this.type = type;
        this.component = component;
        this.description = description.length() > 300 ? description.substring(0, 300) : description;
        this.amountMinor = amountMinor;
        this.currency = currency;
        this.earnedOn = earnedOn;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
    }

    void assignTo(UUID statementId) {
        if (this.statementId != null && !this.statementId.equals(statementId)) {
            throw new IllegalStateException("Entry " + id + " is already on statement " + this.statementId);
        }
        this.statementId = statementId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public UUID getOrderId() {
        return orderId;
    }

    public String getOrderReference() {
        return orderReference;
    }

    public Type getType() {
        return type;
    }

    public String getComponent() {
        return component;
    }

    public String getDescription() {
        return description;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public LocalDate getEarnedOn() {
        return earnedOn;
    }

    public UUID getStatementId() {
        return statementId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntryRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionEntryRepository.java`.

```java
package com.uniti.partnerportal.commissions;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionEntryRepository extends JpaRepository<CommissionEntry, UUID> {

    boolean existsByOrderIdAndType(UUID orderId, CommissionEntry.Type type);

    List<CommissionEntry> findByOrderIdAndType(UUID orderId, CommissionEntry.Type type);

    List<CommissionEntry> findByStatementIdOrderByEarnedOnAscCreatedAtAsc(UUID statementId);

    List<CommissionEntry> findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(UUID partnerId,
                                                                                     LocalDate cutoff);

    @Query("""
            SELECT DISTINCT e.partnerId FROM CommissionEntry e
            WHERE e.statementId IS NULL AND e.earnedOn <= :cutoff
            """)
    List<UUID> findPartnersWithUnbilledEntries(@Param("cutoff") LocalDate cutoff);

    @Query("""
            SELECT COALESCE(SUM(e.amountMinor), 0) FROM CommissionEntry e
            WHERE e.partnerId = :partnerId AND e.earnedOn BETWEEN :from AND :to
            """)
    long sumEarned(@Param("partnerId") UUID partnerId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            SELECT COALESCE(SUM(e.amountMinor), 0) FROM CommissionEntry e
            WHERE e.partnerId = :partnerId AND e.statementId IS NULL
            """)
    long sumUnbilled(@Param("partnerId") UUID partnerId);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayout.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayout.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.common.domain.StateMachine;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A bank payment for an approved statement. Failed payments (e.g. rejected bank details) can be
 * rescheduled once the partner has corrected them.
 */
@Entity
@Table(name = "commission_payout")
public class CommissionPayout extends AuditableEntity {

    public enum Status { SCHEDULED, PAID, FAILED }

    static final StateMachine<Status> LIFECYCLE = StateMachine.builder("Commission payout", Status.class)
            .allow(Status.SCHEDULED, Status.PAID, Status.FAILED)
            .allow(Status.FAILED, Status.SCHEDULED)
            .build();

    @Id
    private UUID id;

    @Column(name = "statement_id", nullable = false, unique = true)
    private UUID statementId;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "scheduled_for", nullable = false)
    private LocalDate scheduledFor;

    @Column(name = "payment_reference", length = 40)
    private String paymentReference;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    protected CommissionPayout() {
    }

    public CommissionPayout(UUID id, UUID statementId, UUID partnerId, long amountMinor, String currency,
                            LocalDate scheduledFor) {
        if (amountMinor <= 0) {
            throw new IllegalArgumentException("Payout amount must be positive");
        }
        this.id = id;
        this.statementId = statementId;
        this.partnerId = partnerId;
        this.amountMinor = amountMinor;
        this.currency = currency;
        this.scheduledFor = scheduledFor;
        this.status = Status.SCHEDULED;
    }

    public void markPaid(String paymentReference, Instant at) {
        LIFECYCLE.assertTransition(status, Status.PAID);
        this.status = Status.PAID;
        this.paymentReference = paymentReference;
        this.paidAt = at;
        this.failureReason = null;
    }

    public void markFailed(String reason) {
        LIFECYCLE.assertTransition(status, Status.FAILED);
        this.status = Status.FAILED;
        this.failureReason = reason;
    }

    public void reschedule(LocalDate date) {
        LIFECYCLE.assertTransition(status, Status.SCHEDULED);
        this.status = Status.SCHEDULED;
        this.scheduledFor = date;
    }

    public UUID getId() {
        return id;
    }

    public UUID getStatementId() {
        return statementId;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public Status getStatus() {
        return status;
    }

    public LocalDate getScheduledFor() {
        return scheduledFor;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public String getFailureReason() {
        return failureReason;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayoutRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionPayoutRepository.java`.

```java
package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface CommissionPayoutRepository extends JpaRepository<CommissionPayout, UUID> {

    Optional<CommissionPayout> findByStatementId(UUID statementId);

    @Query("""
            SELECT p FROM CommissionPayout p
            WHERE (:partnerId IS NULL OR p.partnerId = :partnerId)
              AND (:status IS NULL OR p.status = :status)
            """)
    Page<CommissionPayout> search(@Param("partnerId") UUID partnerId,
                                  @Param("status") CommissionPayout.Status status,
                                  Pageable pageable);

    @Query("""
            SELECT COALESCE(SUM(p.amountMinor), 0) FROM CommissionPayout p
            WHERE p.partnerId = :partnerId
              AND p.status = com.uniti.partnerportal.commissions.CommissionPayout.Status.PAID
              AND p.paidAt >= :since
            """)
    long sumPaidSince(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    @Query("""
            SELECT COALESCE(SUM(p.amountMinor), 0) FROM CommissionPayout p
            WHERE p.partnerId = :partnerId
              AND p.status <> com.uniti.partnerportal.commissions.CommissionPayout.Status.PAID
            """)
    long sumOutstanding(@Param("partnerId") UUID partnerId);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRule.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRule.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.partner.PartnerTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A time-boxed incentive layered on top of the tier base rate, e.g. "+3% on SD-WAN sold on 36+
 * month terms this quarter" or "flat 150.00 per order containing hosted voice". A rule with no
 * category applies to every product; a rule with a minimum tier only pays partners at or above it.
 */
@Entity
@Table(name = "commission_rule")
public class CommissionRule extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "product_category", length = 20)
    private CatalogProduct.Category productCategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "min_tier", length = 20)
    private PartnerTier minTier;

    @Column(name = "min_term_months", nullable = false)
    private int minTermMonths;

    @Column(name = "rate_bps", nullable = false)
    private int rateBps;

    @Column(name = "flat_bonus_minor", nullable = false)
    private long flatBonusMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    @Column(nullable = false)
    private boolean active;

    protected CommissionRule() {
    }

    public CommissionRule(UUID id, String name, CatalogProduct.Category productCategory, PartnerTier minTier,
                          int minTermMonths, int rateBps, long flatBonusMinor, String currency,
                          LocalDate validFrom, LocalDate validTo) {
        this.id = id;
        this.name = name;
        this.productCategory = productCategory;
        this.minTier = minTier;
        this.minTermMonths = minTermMonths;
        this.rateBps = rateBps;
        this.flatBonusMinor = flatBonusMinor;
        this.currency = currency;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.active = true;
    }

    public boolean isEffectiveOn(LocalDate date) {
        return active && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    /** Whether the rule pays this partner for an order of this term at all. */
    public boolean eligible(PartnerTier tier, int termMonths) {
        return (minTier == null || tier.compareTo(minTier) >= 0) && termMonths >= minTermMonths;
    }

    public boolean covers(CatalogProduct.Category category) {
        return productCategory == null || productCategory == category;
    }

    public void deactivate() {
        this.active = false;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public CatalogProduct.Category getProductCategory() {
        return productCategory;
    }

    public PartnerTier getMinTier() {
        return minTier;
    }

    public int getMinTermMonths() {
        return minTermMonths;
    }

    public int getRateBps() {
        return rateBps;
    }

    public long getFlatBonusMinor() {
        return flatBonusMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public LocalDate getValidFrom() {
        return validFrom;
    }

    public LocalDate getValidTo() {
        return validTo;
    }

    public boolean isActive() {
        return active;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRuleRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionRuleRepository.java`.

```java
package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionRuleRepository extends JpaRepository<CommissionRule, UUID> {

    @Query("""
            SELECT r FROM CommissionRule r
            WHERE r.active = true
              AND r.validFrom <= :date
              AND (r.validTo IS NULL OR r.validTo >= :date)
            ORDER BY r.name
            """)
    List<CommissionRule> findEffectiveOn(@Param("date") LocalDate date);

    Page<CommissionRule> findByActive(boolean active, Pageable pageable);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionService.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionSummaryResponse;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.orders.OrderEvents;
import com.uniti.partnerportal.orders.PartnerOrder;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Commission ledger, monthly statements and payouts.
 * <ul>
 *   <li>Accruals are posted when an order goes live (after the order transaction commits, so a
 *       commission fault can never undo an activation). Posting is idempotent per order.</li>
 *   <li>If the customer terminates within the clawback window, every accrual for that order is
 *       reversed in full.</li>
 *   <li>Each month every unbilled entry is swept onto a statement. Partners may dispute an issued
 *       statement within {@value #DISPUTE_WINDOW_DAYS} days; channel managers resolve disputes
 *       with adjustment entries.</li>
 *   <li>Approved statements below {@value #MIN_PAYOUT_MINOR} minor units (or negative) are
 *       carried forward into the next statement instead of paid.</li>
 * </ul>
 */
@Service
@Transactional
public class CommissionService {

    private static final Logger log = LoggerFactory.getLogger(CommissionService.class);
    static final long MIN_PAYOUT_MINOR = 5_000L;
    static final int DISPUTE_WINDOW_DAYS = 30;
    static final int PAYMENT_TERMS_DAYS = 30;
    static final String SYSTEM = "system";

    private final CommissionRuleRepository rules;
    private final CommissionEntryRepository entries;
    private final CommissionStatementRepository statements;
    private final CommissionPayoutRepository payouts;
    private final PartnerOrderRepository orders;
    private final PartnerService partners;
    private final CommissionCalculator calculator;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public CommissionService(CommissionRuleRepository rules, CommissionEntryRepository entries,
                             CommissionStatementRepository statements, CommissionPayoutRepository payouts,
                             PartnerOrderRepository orders, PartnerService partners, CommissionCalculator calculator,
                             ReferenceGenerator references, PortalProperties properties, Clock clock) {
        this.rules = rules;
        this.entries = entries;
        this.statements = statements;
        this.payouts = payouts;
        this.orders = orders;
        this.partners = partners;
        this.calculator = calculator;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- ledger

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderActivated(OrderEvents.OrderActivated event) {
        accrueForOrder(event.orderId());
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderCeased(OrderEvents.OrderCeased event) {
        clawbackForOrder(event.orderId(), event.activatedAt(), event.ceasedAt(), event.reason());
    }

    public List<CommissionEntry> accrueForOrder(UUID orderId) {
        if (entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)) {
            log.info("commission_accrual_skipped orderId={} reason=already_accrued", orderId);
            return List.of();
        }
        PartnerOrder order = orders.findById(orderId).orElseThrow(() -> new PortalException.NotFound("Order", orderId));
        if (order.getActivatedAt() == null) {
            throw new PortalException.BusinessRule("commission.order_not_active",
                    "Order " + order.getReference() + " has not gone live");
        }
        Partner partner = partners.load(order.getPartnerId());
        LocalDate earnedOn = order.getActivatedAt().atZone(ZoneOffset.UTC).toLocalDate();
        var basis = new CommissionCalculator.OrderBasis(order.getCurrency(), order.getTermMonths(),
                order.getDealId() != null, order.isNewLogo(),
                order.getSites().stream()
                        .map(s -> new CommissionCalculator.SiteBasis(s.getProductCategory(), s.getNetMrcMinor()))
                        .toList());
        var result = calculator.calculate(basis, partner.getTier(), rules.findEffectiveOn(earnedOn),
                properties.commissions());
        Instant now = Instant.now(clock);
        List<CommissionEntry> posted = result.lines().stream()
                .map(line -> new CommissionEntry(UUID.randomUUID(), order.getPartnerId(), order.getId(),
                        order.getReference(), CommissionEntry.Type.ACCRUAL, line.component(), line.description(),
                        line.amount().amountMinor(), line.amount().currency(), earnedOn, now, SYSTEM))
                .toList();
        entries.saveAll(posted);
        log.info("commission_accrued orderRef={} partnerId={} total={}", order.getReference(), order.getPartnerId(),
                result.total());
        return posted;
    }

    /**
     * Reverses every accrual for the order when it ceased inside the clawback window. Termination
     * outside the window keeps the commission.
     */
    public List<CommissionEntry> clawbackForOrder(UUID orderId, Instant activatedAt, Instant ceasedAt, String reason) {
        long liveDays = ChronoUnit.DAYS.between(activatedAt, ceasedAt);
        if (liveDays > properties.commissions().clawbackWindowDays()) {
            log.info("commission_clawback_skipped orderId={} liveDays={}", orderId, liveDays);
            return List.of();
        }
        if (entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.CLAWBACK)) {
            return List.of();
        }
        LocalDate on = ceasedAt.atZone(ZoneOffset.UTC).toLocalDate();
        Instant now = Instant.now(clock);
        List<CommissionEntry> reversals = entries.findByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL).stream()
                .map(a -> new CommissionEntry(UUID.randomUUID(), a.getPartnerId(), a.getOrderId(),
                        a.getOrderReference(), CommissionEntry.Type.CLAWBACK, a.getComponent(),
                        "Clawback after " + liveDays + " days live: " + reason, -a.getAmountMinor(),
                        a.getCurrency(), on, now, SYSTEM))
                .toList();
        entries.saveAll(reversals);
        log.info("commission_clawed_back orderId={} entries={}", orderId, reversals.size());
        return reversals;
    }

    // ---------------------------------------------------------------- statements

    /**
     * Sweeps all unbilled entries earned up to the end of {@code period} onto a new statement,
     * bringing in any carried-forward balance. Returns empty when there is nothing to bill.
     */
    public Optional<CommissionStatement> generateStatement(UUID partnerId, YearMonth period) {
        if (!period.isBefore(YearMonth.now(clock))) {
            throw new PortalException.BusinessRule("commission.period_open",
                    "Statements can only be generated for closed months");
        }
        LocalDate start = period.atDay(1);
        if (statements.existsByPartnerIdAndPeriodStart(partnerId, start)) {
            throw new PortalException.Conflict("commission.statement_exists",
                    "A statement already exists for " + period);
        }
        Partner partner = partners.load(partnerId);
        LocalDate end = period.atEndOfMonth();
        List<CommissionEntry> unbilled = entries.findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(
                partnerId, end);
        List<CommissionStatement> carried = statements.findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(
                partnerId, StatementStatus.CARRIED_FORWARD);
        if (unbilled.isEmpty() && carried.isEmpty()) {
            return Optional.empty();
        }
        CommissionStatement statement = new CommissionStatement(UUID.randomUUID(),
                references.next(ReferenceGenerator.Kind.STATEMENT), partnerId, start, end, partner.getCurrency());
        long broughtForward = 0;
        for (CommissionStatement previous : carried) {
            broughtForward = Math.addExact(broughtForward, previous.getNetPayableMinor());
            previous.carryInto(statement.getId());
        }
        unbilled.forEach(e -> e.assignTo(statement.getId()));
        statement.recalculate(unbilled, broughtForward);
        return Optional.of(statements.save(statement));
    }

    /**
     * Runs on the 2nd of each month: bills the previous month for every partner with activity
     * and issues the statements so partners can review them.
     */
    @Scheduled(cron = "0 0 2 2 * *", zone = "UTC")
    public void runMonthlyStatementCycle() {
        YearMonth period = YearMonth.now(clock).minusMonths(1);
        Instant now = Instant.now(clock);
        for (UUID partnerId : entries.findPartnersWithUnbilledEntries(period.atEndOfMonth())) {
            try {
                if (!statements.existsByPartnerIdAndPeriodStart(partnerId, period.atDay(1))) {
                    generateStatement(partnerId, period).ifPresent(s -> s.issue(now));
                }
            } catch (RuntimeException ex) {
                log.error("commission_statement_failed partnerId={} period={}", partnerId, period, ex);
            }
        }
    }

    public CommissionStatement issue(UUID statementId) {
        CommissionStatement statement = load(statementId);
        statement.issue(Instant.now(clock));
        return statement;
    }

    public CommissionStatement dispute(UUID statementId, String reason, CurrentUser user) {
        CommissionStatement statement = getStatement(statementId, user);
        if (!isDisputable(statement)) {
            throw new PortalException.BusinessRule("commission.dispute_window_closed",
                    "Statements can be disputed within " + DISPUTE_WINDOW_DAYS + " days of issue");
        }
        statement.dispute(reason.trim(), Instant.now(clock));
        log.info("commission_statement_disputed statementRef={} by={}", statement.getReference(), user.subject());
        return statement;
    }

    public CommissionStatement adjust(UUID statementId, long amountMinor, String description, CurrentUser manager) {
        CommissionStatement statement = load(statementId);
        if (!statement.getStatus().acceptsAdjustments()) {
            throw new PortalException.BusinessRule("commission.not_adjustable",
                    "Only draft or disputed statements can be adjusted");
        }
        LocalDate on = LocalDate.now(clock);
        CommissionEntry adjustment = new CommissionEntry(UUID.randomUUID(), statement.getPartnerId(), null, null,
                CommissionEntry.Type.ADJUSTMENT, "ADJUSTMENT", description.trim(), amountMinor,
                statement.getCurrency(), on.isAfter(statement.getPeriodEnd()) ? statement.getPeriodEnd() : on,
                Instant.now(clock), manager.subject());
        adjustment.assignTo(statement.getId());
        entries.save(adjustment);
        List<CommissionEntry> all = new ArrayList<>(entries.findByStatementIdOrderByEarnedOnAscCreatedAtAsc(
                statement.getId()));
        if (all.stream().noneMatch(e -> e.getId().equals(adjustment.getId()))) {
            all.add(adjustment);
        }
        statement.recalculate(all, statement.getBroughtForwardMinor());
        return statement;
    }

    public CommissionStatement reissue(UUID statementId) {
        CommissionStatement statement = load(statementId);
        if (statement.getStatus() != StatementStatus.DISPUTED) {
            throw new PortalException.BusinessRule("commission.not_disputed", "Only disputed statements are reissued");
        }
        statement.issue(Instant.now(clock));
        return statement;
    }

    /**
     * Approves an issued statement for payment. Small or negative balances are carried forward
     * rather than paid; anything else schedules a payout on standard payment terms.
     */
    public CommissionStatement approve(UUID statementId, CurrentUser manager) {
        CommissionStatement statement = load(statementId);
        Instant now = Instant.now(clock);
        if (statement.getNetPayableMinor() < MIN_PAYOUT_MINOR) {
            statement.decide(StatementStatus.CARRIED_FORWARD, manager.subject(), now);
            return statement;
        }
        statement.decide(StatementStatus.APPROVED, manager.subject(), now);
        payouts.save(new CommissionPayout(UUID.randomUUID(), statement.getId(), statement.getPartnerId(),
                statement.getNetPayableMinor(), statement.getCurrency(),
                LocalDate.now(clock).plusDays(PAYMENT_TERMS_DAYS)));
        return statement;
    }

    public CommissionPayout markPayoutPaid(UUID payoutId, String paymentReference) {
        CommissionPayout payout = loadPayout(payoutId);
        Instant now = Instant.now(clock);
        payout.markPaid(paymentReference.trim(), now);
        load(payout.getStatementId()).markPaid(now);
        return payout;
    }

    public CommissionPayout markPayoutFailed(UUID payoutId, String reason) {
        CommissionPayout payout = loadPayout(payoutId);
        payout.markFailed(reason);
        log.warn("commission_payout_failed payoutId={} partnerId={}", payoutId, payout.getPartnerId());
        return payout;
    }

    public CommissionPayout reschedulePayout(UUID payoutId) {
        CommissionPayout payout = loadPayout(payoutId);
        payout.reschedule(LocalDate.now(clock).plusDays(1));
        return payout;
    }

    // ---------------------------------------------------------------- queries

    @Transactional(readOnly = true)
    public Page<CommissionStatement> searchStatements(UUID partnerId, StatementStatus status, Pageable pageable,
                                                      CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        return statements.search(scope, status, pageable);
    }

    @Transactional(readOnly = true)
    public CommissionStatement getStatement(UUID statementId, CurrentUser user) {
        CommissionStatement statement = load(statementId);
        user.assertCanAccess(statement.getPartnerId());
        return statement;
    }

    @Transactional(readOnly = true)
    public List<CommissionEntry> statementEntries(UUID statementId) {
        return entries.findByStatementIdOrderByEarnedOnAscCreatedAtAsc(statementId);
    }

    @Transactional(readOnly = true)
    public Optional<CommissionPayout> statementPayout(UUID statementId) {
        return payouts.findByStatementId(statementId);
    }

    @Transactional(readOnly = true)
    public Page<CommissionPayout> searchPayouts(UUID partnerId, CommissionPayout.Status status, Pageable pageable,
                                                CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        return payouts.search(scope, status, pageable);
    }

    @Transactional(readOnly = true)
    public CommissionSummaryResponse summary(UUID requestedPartner, CurrentUser user) {
        UUID partnerId = user.effectivePartner(requestedPartner);
        Partner partner = partners.load(partnerId);
        LocalDate today = LocalDate.now(clock);
        LocalDate yearStart = Year.from(today).atDay(1);
        return new CommissionSummaryResponse(partner.getCurrency(), partner.getTier(),
                partner.getTier().commissionRateBps(),
                entries.sumEarned(partnerId, yearStart, today),
                entries.sumUnbilled(partnerId),
                payouts.sumPaidSince(partnerId, yearStart.atStartOfDay(ZoneOffset.UTC).toInstant()),
                payouts.sumOutstanding(partnerId));
    }

    public boolean isDisputable(CommissionStatement statement) {
        return statement.getStatus() == StatementStatus.ISSUED && statement.getIssuedAt() != null
                && !statement.getIssuedAt().plus(DISPUTE_WINDOW_DAYS, ChronoUnit.DAYS).isBefore(Instant.now(clock));
    }

    // ---------------------------------------------------------------- rules

    @Transactional(readOnly = true)
    public Page<CommissionRule> listRules(boolean active, Pageable pageable) {
        return rules.findByActive(active, pageable);
    }

    public CommissionRule createRule(CommissionRuleRequest request) {
        if (request.validTo() != null && request.validTo().isBefore(LocalDate.now(clock))) {
            throw new PortalException.BusinessRule("commission.rule_in_past", "A rule cannot end in the past");
        }
        return rules.save(new CommissionRule(UUID.randomUUID(), request.name().trim(), request.productCategory(),
                request.minTier(), request.minTermMonths(), request.rateBps(), request.flatBonusMinor(),
                properties.pricing().defaultCurrency(), request.validFrom(), request.validTo()));
    }

    public CommissionRule deactivateRule(UUID ruleId) {
        CommissionRule rule = rules.findById(ruleId)
                .orElseThrow(() -> new PortalException.NotFound("CommissionRule", ruleId));
        rule.deactivate();
        return rule;
    }

    private CommissionStatement load(UUID statementId) {
        return statements.findById(statementId)
                .orElseThrow(() -> new PortalException.NotFound("CommissionStatement", statementId));
    }

    private CommissionPayout loadPayout(UUID payoutId) {
        return payouts.findById(payoutId).orElseThrow(() -> new PortalException.NotFound("CommissionPayout", payoutId));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatement.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatement.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.UUID;

/**
 * Monthly commission statement for one partner: every ledger entry earned up to the period end
 * that was not on an earlier statement, plus any balance brought forward from a statement that
 * was too small (or negative) to pay.
 */
@Entity
@Table(name = "commission_statement")
public class CommissionStatement extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatementStatus status;

    @Column(name = "accrued_minor", nullable = false)
    private long accruedMinor;

    @Column(name = "clawback_minor", nullable = false)
    private long clawbackMinor;

    @Column(name = "adjustment_minor", nullable = false)
    private long adjustmentMinor;

    @Column(name = "brought_forward_minor", nullable = false)
    private long broughtForwardMinor;

    @Column(name = "net_payable_minor", nullable = false)
    private long netPayableMinor;

    @Column(name = "issued_at")
    private Instant issuedAt;

    @Column(name = "dispute_reason", length = 1000)
    private String disputeReason;

    @Column(name = "disputed_at")
    private Instant disputedAt;

    @Column(name = "decided_by", length = 120)
    private String decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "carried_into_statement_id")
    private UUID carriedIntoStatementId;

    protected CommissionStatement() {
    }

    public CommissionStatement(UUID id, String reference, UUID partnerId, LocalDate periodStart, LocalDate periodEnd,
                               String currency) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.currency = currency;
        this.status = StatementStatus.DRAFT;
    }

    /**
     * Recomputes the totals from the entries on the statement. Called whenever the entry set
     * changes so the figures can never disagree with the ledger.
     */
    public void recalculate(Collection<CommissionEntry> entries, long broughtForward) {
        long accrued = 0;
        long clawback = 0;
        long adjustment = 0;
        for (CommissionEntry e : entries) {
            if (!e.getCurrency().equals(currency)) {
                throw new IllegalArgumentException("Entry " + e.getId() + " is not in " + currency);
            }
            switch (e.getType()) {
                case ACCRUAL -> accrued = Math.addExact(accrued, e.getAmountMinor());
                case CLAWBACK -> clawback = Math.addExact(clawback, e.getAmountMinor());
                case ADJUSTMENT -> adjustment = Math.addExact(adjustment, e.getAmountMinor());
            }
        }
        this.accruedMinor = accrued;
        this.clawbackMinor = clawback;
        this.adjustmentMinor = adjustment;
        this.broughtForwardMinor = broughtForward;
        this.netPayableMinor = Math.addExact(Math.addExact(Math.addExact(accrued, clawback), adjustment),
                broughtForward);
    }

    public void transitionTo(StatementStatus next) {
        StatementStatus.LIFECYCLE.assertTransition(status, next);
        this.status = next;
    }

    public void issue(Instant at) {
        transitionTo(StatementStatus.ISSUED);
        this.issuedAt = at;
    }

    public void dispute(String reason, Instant at) {
        transitionTo(StatementStatus.DISPUTED);
        this.disputeReason = reason;
        this.disputedAt = at;
    }

    public void decide(StatementStatus outcome, String by, Instant at) {
        transitionTo(outcome);
        this.decidedBy = by;
        this.decidedAt = at;
    }

    public void markPaid(Instant at) {
        transitionTo(StatementStatus.PAID);
        this.paidAt = at;
    }

    public void carryInto(UUID statementId) {
        if (status != StatementStatus.CARRIED_FORWARD || carriedIntoStatementId != null) {
            throw new IllegalStateException("Statement " + reference + " has no balance to carry forward");
        }
        this.carriedIntoStatementId = statementId;
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

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public String getCurrency() {
        return currency;
    }

    public StatementStatus getStatus() {
        return status;
    }

    public long getAccruedMinor() {
        return accruedMinor;
    }

    public long getClawbackMinor() {
        return clawbackMinor;
    }

    public long getAdjustmentMinor() {
        return adjustmentMinor;
    }

    public long getBroughtForwardMinor() {
        return broughtForwardMinor;
    }

    public long getNetPayableMinor() {
        return netPayableMinor;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public String getDisputeReason() {
        return disputeReason;
    }

    public Instant getDisputedAt() {
        return disputedAt;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public UUID getCarriedIntoStatementId() {
        return carriedIntoStatementId;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatementRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/CommissionStatementRepository.java`.

```java
package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionStatementRepository extends JpaRepository<CommissionStatement, UUID> {

    boolean existsByPartnerIdAndPeriodStart(UUID partnerId, LocalDate periodStart);

    List<CommissionStatement> findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(UUID partnerId,
                                                                                     StatementStatus status);

    @Query("""
            SELECT s FROM CommissionStatement s
            WHERE (:partnerId IS NULL OR s.partnerId = :partnerId)
              AND (:status IS NULL OR s.status = :status)
            """)
    Page<CommissionStatement> search(@Param("partnerId") UUID partnerId,
                                     @Param("status") StatementStatus status,
                                     Pageable pageable);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/StatementStatus.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/StatementStatus.java`.

```java
package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * <pre>
 * DRAFT -> ISSUED -> APPROVED -> PAID
 *           | ^  \
 *           v |   +-> CARRIED_FORWARD (net below the payout minimum, or negative)
 *         DISPUTED
 * </pre>
 * A carried-forward statement's balance is brought into the partner's next statement.
 */
public enum StatementStatus {
    DRAFT,
    ISSUED,
    DISPUTED,
    APPROVED,
    CARRIED_FORWARD,
    PAID;

    public static final StateMachine<StatementStatus> LIFECYCLE = StateMachine
            .builder("Commission statement", StatementStatus.class)
            .allow(DRAFT, ISSUED)
            .allow(ISSUED, DISPUTED, APPROVED, CARRIED_FORWARD)
            .allow(DISPUTED, ISSUED)
            .allow(APPROVED, PAID)
            .build();

    public boolean acceptsAdjustments() {
        return this == DRAFT || this == DISPUTED;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/dto/CommissionDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/commissions/dto/CommissionDtos.java`.

```java
package com.uniti.partnerportal.commissions.dto;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.commissions.CommissionEntry;
import com.uniti.partnerportal.commissions.CommissionPayout;
import com.uniti.partnerportal.commissions.StatementStatus;
import com.uniti.partnerportal.partner.PartnerTier;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

public final class CommissionDtos {

    private CommissionDtos() {
    }

    public record CommissionRuleRequest(
            @NotBlank @Size(max = 80) String name,
            CatalogProduct.Category productCategory,
            PartnerTier minTier,
            @Min(0) @Max(60) int minTermMonths,
            @Min(0) @Max(2000) int rateBps,
            @PositiveOrZero long flatBonusMinor,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {

        @AssertTrue(message = "a rule must pay a rate, a flat bonus or both")
        public boolean isPaying() {
            return rateBps > 0 || flatBonusMinor > 0;
        }

        @AssertTrue(message = "validTo must not be before validFrom")
        public boolean isWindowValid() {
            return validTo == null || validFrom == null || !validTo.isBefore(validFrom);
        }
    }

    public record CommissionRuleResponse(UUID id, String name, CatalogProduct.Category productCategory,
                                         PartnerTier minTier, int minTermMonths, int rateBps, long flatBonusMinor,
                                         String currency, LocalDate validFrom, LocalDate validTo, boolean active) {
    }

    public record GenerateStatementRequest(@NotNull UUID partnerId, @NotNull YearMonth period) {
    }

    public record DisputeRequest(@NotBlank @Size(max = 1000) String reason) {
    }

    public record AdjustmentRequest(@NotNull Long amountMinor, @NotBlank @Size(max = 300) String description) {

        @AssertTrue(message = "an adjustment cannot be zero")
        public boolean isNonZero() {
            return amountMinor == null || amountMinor != 0;
        }
    }

    public record PayoutPaidRequest(@NotBlank @Size(max = 40) String paymentReference) {
    }

    public record PayoutFailedRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record EntryResponse(UUID id, UUID orderId, String orderReference, CommissionEntry.Type type,
                                String component, String description, long amountMinor, String currency,
                                LocalDate earnedOn) {
    }

    public record StatementResponse(UUID id, String reference, UUID partnerId, LocalDate periodStart,
                                    LocalDate periodEnd, String currency, StatementStatus status, long accruedMinor,
                                    long clawbackMinor, long adjustmentMinor, long broughtForwardMinor,
                                    long netPayableMinor, Instant issuedAt, String disputeReason,
                                    Instant decidedAt, Instant paidAt, boolean disputable) {
    }

    public record PayoutResponse(UUID id, UUID statementId, UUID partnerId, long amountMinor, String currency,
                                 CommissionPayout.Status status, LocalDate scheduledFor, String paymentReference,
                                 Instant paidAt, String failureReason) {
    }

    public record StatementDetailResponse(StatementResponse statement, List<EntryResponse> entries,
                                          PayoutResponse payout) {
    }

    public record CommissionSummaryResponse(String currency, PartnerTier tier, int tierRateBps,
                                            long earnedYearToDateMinor, long unbilledMinor,
                                            long paidYearToDateMinor, long outstandingPayoutMinor) {
    }
}
```

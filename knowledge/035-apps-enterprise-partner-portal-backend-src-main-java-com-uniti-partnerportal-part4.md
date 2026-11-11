# Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 4 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 17

## Files

- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderStatus.java` (39 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrder.java` (287 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrderRepository.java` (61 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/ProvisioningStage.java` (38 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/dto/OrderDtos.java` (80 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocument.java` (163 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocumentType.java` (42 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/Partner.java` (298 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerController.java` (183 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerMapper.java` (71 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerRepository.java` (36 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerService.java` (291 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerStatus.java` (35 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerTier.java` (83 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/TierEvaluationService.java` (103 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/dto/PartnerDtos.java` (135 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/ApprovalLevel.java` (26 lines)

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderStatus.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderStatus.java`.

```java
package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.domain.StateMachine;

import java.util.EnumSet;
import java.util.Set;

/**
 * Platform order lifecycle.
 * <pre>
 * DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE
 *   |          |            |              |
 *   +----------+------------+--> CANCELLED +--> FAILED -> SUBMITTED (resubmit)
 * </pre>
 * Orders can be cancelled freely until provisioning starts; after that only the provisioning
 * outcome (ACTIVE or FAILED) can close them.
 */
public enum OrderStatus {
    DRAFT,
    SUBMITTED,
    VALIDATED,
    PROVISIONING,
    ACTIVE,
    CANCELLED,
    FAILED;

    public static final StateMachine<OrderStatus> LIFECYCLE = StateMachine
            .builder("Order", OrderStatus.class)
            .allow(DRAFT, SUBMITTED, CANCELLED)
            .allow(SUBMITTED, VALIDATED, FAILED, CANCELLED)
            .allow(VALIDATED, PROVISIONING, CANCELLED)
            .allow(PROVISIONING, ACTIVE, FAILED)
            .allow(FAILED, SUBMITTED, CANCELLED)
            .build();

    /** Orders still moving through fulfilment, shown as "in flight" on the dashboard. */
    public static final Set<OrderStatus> IN_FLIGHT = EnumSet.of(SUBMITTED, VALIDATED, PROVISIONING);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrder.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrder.java`.

```java
package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An order placed by a partner on behalf of a customer, created from an accepted quote. Pricing
 * is copied from the quote so the order is the commercial record even if the quote is later
 * archived; per-site fulfilment is tracked on {@link OrderSite}.
 */
@Entity
@Table(name = "partner_order")
public class PartnerOrder extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "quote_id", nullable = false, unique = true)
    private UUID quoteId;

    @Column(name = "quote_reference", nullable = false, length = 20)
    private String quoteReference;

    @Column(name = "deal_id")
    private UUID dealId;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Column(name = "customer_account_id", nullable = false, length = 12)
    private String customerAccountId;

    @Column(name = "new_logo", nullable = false)
    private boolean newLogo;

    @Column(name = "customer_contact_email", nullable = false, length = 200)
    private String customerContactEmail;

    @Column(name = "purchase_order_number", length = 40)
    private String purchaseOrderNumber;

    @Column(name = "term_months", nullable = false)
    private int termMonths;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "monthly_recurring_minor", nullable = false)
    private long monthlyRecurringMinor;

    @Column(name = "one_off_minor", nullable = false)
    private long oneOffMinor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(name = "requested_by", nullable = false, length = 120)
    private String requestedBy;

    @Column(name = "requested_install_date")
    private LocalDate requestedInstallDate;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "ceased_at")
    private Instant ceasedAt;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("siteNo")
    private List<OrderSite> sites = new ArrayList<>();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("occurredAt")
    private List<OrderEvent> events = new ArrayList<>();

    protected PartnerOrder() {
    }

    public PartnerOrder(UUID id, String reference, UUID partnerId, UUID quoteId, String quoteReference,
                        String currency, String requestedBy) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.quoteId = quoteId;
        this.quoteReference = quoteReference;
        this.currency = currency;
        this.requestedBy = requestedBy;
        this.status = OrderStatus.DRAFT;
    }

    /**
     * Moves the order and appends a timeline entry in one step so the history can never drift
     * from the status.
     */
    public void transitionTo(OrderStatus next, String actor, String detail, Instant at) {
        OrderStatus.LIFECYCLE.assertTransition(status, next);
        OrderStatus previous = status;
        this.status = next;
        this.statusReason = detail;
        if (next == OrderStatus.SUBMITTED) {
            submittedAt = at;
        } else if (next == OrderStatus.ACTIVE) {
            activatedAt = at;
        }
        String suffix = detail == null || detail.isBlank() ? "" : ": " + detail;
        record(OrderEvent.Type.STATUS_CHANGED, actor, previous + " -> " + next + suffix, at);
    }

    public void addSite(OrderSite site) {
        site.setOrder(this);
        sites.add(site);
    }

    public void record(OrderEvent.Type type, String actor, String detail, Instant at) {
        OrderEvent event = new OrderEvent(UUID.randomUUID(), type, actor, detail, at);
        event.setOrder(this);
        events.add(event);
    }

    public boolean allSitesLive() {
        return !sites.isEmpty() && sites.stream().allMatch(s -> s.getStage() == ProvisioningStage.LIVE);
    }

    public void markCeased(Instant at, String reason) {
        this.ceasedAt = at;
        this.statusReason = reason;
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

    public UUID getQuoteId() {
        return quoteId;
    }

    public String getQuoteReference() {
        return quoteReference;
    }

    public UUID getDealId() {
        return dealId;
    }

    public void setDealId(UUID dealId) {
        this.dealId = dealId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerAccountId() {
        return customerAccountId;
    }

    public boolean isNewLogo() {
        return newLogo;
    }

    public void assignAccount(String customerAccountId, boolean newLogo) {
        this.customerAccountId = customerAccountId;
        this.newLogo = newLogo;
    }

    public String getCustomerContactEmail() {
        return customerContactEmail;
    }

    public void setCustomerContactEmail(String customerContactEmail) {
        this.customerContactEmail = customerContactEmail;
    }

    public String getPurchaseOrderNumber() {
        return purchaseOrderNumber;
    }

    public void setPurchaseOrderNumber(String purchaseOrderNumber) {
        this.purchaseOrderNumber = purchaseOrderNumber;
    }

    public int getTermMonths() {
        return termMonths;
    }

    public void setTermMonths(int termMonths) {
        this.termMonths = termMonths;
    }

    public String getCurrency() {
        return currency;
    }

    public long getMonthlyRecurringMinor() {
        return monthlyRecurringMinor;
    }

    public long getOneOffMinor() {
        return oneOffMinor;
    }

    public void setCharges(long monthlyRecurringMinor, long oneOffMinor) {
        this.monthlyRecurringMinor = monthlyRecurringMinor;
        this.oneOffMinor = oneOffMinor;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public LocalDate getRequestedInstallDate() {
        return requestedInstallDate;
    }

    public void setRequestedInstallDate(LocalDate requestedInstallDate) {
        this.requestedInstallDate = requestedInstallDate;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getCeasedAt() {
        return ceasedAt;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public List<OrderSite> getSites() {
        return sites;
    }

    public List<OrderEvent> getEvents() {
        return events;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrderRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/PartnerOrderRepository.java`.

```java
package com.uniti.partnerportal.orders;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerOrderRepository extends JpaRepository<PartnerOrder, UUID> {

    Optional<PartnerOrder> findByQuoteId(UUID quoteId);

    @Query("""
            SELECT o FROM PartnerOrder o
            WHERE (:partnerId IS NULL OR o.partnerId = :partnerId)
              AND (:status IS NULL OR o.status = :status)
              AND (:search IS NULL
                   OR LOWER(o.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.reference = :search
                   OR o.customerAccountId = :search)
            """)
    Page<PartnerOrder> search(@Param("partnerId") UUID partnerId,
                              @Param("status") OrderStatus status,
                              @Param("search") String search,
                              Pageable pageable);

    /**
     * Monthly recurring revenue of orders that went live in the window and have not since been
     * ceased; the basis of trailing-revenue tier evaluation.
     */
    @Query("""
            SELECT COALESCE(SUM(o.monthlyRecurringMinor), 0) FROM PartnerOrder o
            WHERE o.partnerId = :partnerId
              AND o.status = com.uniti.partnerportal.orders.OrderStatus.ACTIVE
              AND o.activatedAt >= :since
              AND o.ceasedAt IS NULL
            """)
    long sumActivatedMonthlyRecurring(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    @Query("""
            SELECT o.status AS status, COUNT(o) AS count, COALESCE(SUM(o.monthlyRecurringMinor), 0) AS mrc
            FROM PartnerOrder o
            WHERE o.partnerId = :partnerId AND o.createdAt >= :since
            GROUP BY o.status
            """)
    List<StatusRollup> rollupByStatus(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    interface StatusRollup {
        OrderStatus getStatus();

        long getCount();

        long getMrc();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/ProvisioningStage.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/ProvisioningStage.java`.

```java
package com.uniti.partnerportal.orders;

/**
 * Per-site fulfilment progress as reported by the provisioning platform. Stages normally move
 * forward in declaration order; {@code BLOCKED} can be entered from any non-terminal stage and
 * left back to the stage the site was blocked at or later.
 */
public enum ProvisioningStage {
    AWAITING_SURVEY,
    SURVEY_COMPLETE,
    BUILD_SCHEDULED,
    ENGINEER_BOOKED,
    INSTALLED,
    LIVE,
    BLOCKED;

    public boolean isTerminal() {
        return this == LIVE;
    }

    /**
     * Whether a site may move from this stage to {@code next}. Progress may skip stages (e.g. a
     * site on existing fibre needs no build) but never goes backwards.
     */
    public boolean canMoveTo(ProvisioningStage next, ProvisioningStage resumeFloor) {
        if (this == LIVE || next == this) {
            return false;
        }
        if (next == BLOCKED) {
            return true;
        }
        if (this == BLOCKED) {
            return resumeFloor == null || next.ordinal() >= resumeFloor.ordinal();
        }
        return next.ordinal() > ordinal();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/dto/OrderDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/dto/OrderDtos.java`.

```java
package com.uniti.partnerportal.orders.dto;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.orders.OrderEvent;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.ProvisioningStage;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    public record CreateOrderRequest(
            @NotNull UUID quoteId,
            @Size(max = 40) @Pattern(regexp = "^[A-Za-z0-9/_-]*$", message = "may contain letters, digits, / _ -")
            String purchaseOrderNumber,
            @Future LocalDate requestedInstallDate) {
    }

    public record OrderReasonRequest(@NotBlank @Size(max = 500) String reason) {
    }

    /**
     * Provisioning update for one site, sent by internal users or the provisioning integration.
     */
    public record SiteProgressRequest(
            @NotNull ProvisioningStage stage,
            @Size(max = 500) String note,
            LocalDate engineerVisitDate,
            @Size(max = 40) String serviceId) {
    }

    public record OrderSiteResponse(UUID id, int siteNo, String siteName, String sitePostcode, String sku,
                                    String productName, CatalogProduct.Category productCategory, int quantity,
                                    long netMrcMinor, ProvisioningStage stage, LocalDate engineerVisitDate,
                                    String serviceId, Instant stageUpdatedAt, String blockerNote) {
    }

    public record OrderEventResponse(OrderEvent.Type type, String actor, String detail, Instant occurredAt) {
    }

    public record OrderResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID quoteId,
            String quoteReference,
            UUID dealId,
            String customerName,
            String customerAccountId,
            boolean newLogo,
            String purchaseOrderNumber,
            int termMonths,
            String currency,
            long monthlyRecurringMinor,
            long oneOffMinor,
            OrderStatus status,
            String statusReason,
            int sitesLive,
            int sitesTotal,
            LocalDate requestedInstallDate,
            Instant submittedAt,
            Instant activatedAt,
            Instant ceasedAt,
            List<OrderSiteResponse> sites,
            List<OrderEventResponse> timeline,
            Instant createdAt) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocument.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocument.java`.

```java
package com.uniti.partnerportal.partner;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "kyc_document")
public class KycDocument {

    public enum Status { UPLOADED, VERIFIED, REJECTED }

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id")
    private Partner partner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private KycDocumentType type;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "sha256", nullable = false, length = 64)
    private String sha256;

    @Column(name = "issued_on")
    private LocalDate issuedOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @Column(name = "uploaded_by", nullable = false, length = 120)
    private String uploadedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by", length = 120)
    private String reviewedBy;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    protected KycDocument() {
    }

    public KycDocument(UUID id, KycDocumentType type, String fileName, String storageKey, String sha256,
                       LocalDate issuedOn, Instant uploadedAt, String uploadedBy) {
        this.id = id;
        this.type = type;
        this.fileName = fileName;
        this.storageKey = storageKey;
        this.sha256 = sha256;
        this.issuedOn = issuedOn;
        this.uploadedAt = uploadedAt;
        this.uploadedBy = uploadedBy;
        this.status = Status.UPLOADED;
    }

    public void verify(String reviewer, Instant at) {
        this.status = Status.VERIFIED;
        this.reviewedBy = reviewer;
        this.reviewedAt = at;
        this.rejectionReason = null;
    }

    public void reject(String reviewer, Instant at, String reason) {
        this.status = Status.REJECTED;
        this.reviewedBy = reviewer;
        this.reviewedAt = at;
        this.rejectionReason = reason;
    }

    /**
     * Documents such as bank letters go stale; a document issued longer ago than the type allows
     * cannot be relied on even if it was verified.
     */
    public boolean isStale(LocalDate today) {
        int maxAge = type.maxAgeMonths();
        if (maxAge == 0 || issuedOn == null) {
            return false;
        }
        return issuedOn.plusMonths(maxAge).isBefore(today);
    }

    public UUID getId() {
        return id;
    }

    public Partner getPartner() {
        return partner;
    }

    void setPartner(Partner partner) {
        this.partner = partner;
    }

    public KycDocumentType getType() {
        return type;
    }

    public String getFileName() {
        return fileName;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getSha256() {
        return sha256;
    }

    public LocalDate getIssuedOn() {
        return issuedOn;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public String getUploadedBy() {
        return uploadedBy;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public String getReviewedBy() {
        return reviewedBy;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocumentType.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/KycDocumentType.java`.

```java
package com.uniti.partnerportal.partner;

import java.util.EnumSet;
import java.util.Set;

public enum KycDocumentType {
    CERTIFICATE_OF_INCORPORATION(true, 0),
    VAT_REGISTRATION(true, 0),
    BANK_CONFIRMATION_LETTER(true, 6),
    DIRECTOR_ID(true, 0),
    PROOF_OF_ADDRESS(false, 3),
    INSURANCE_CERTIFICATE(false, 12),
    SIGNED_PARTNER_AGREEMENT(true, 0);

    private final boolean required;
    private final int maxAgeMonths;

    KycDocumentType(boolean required, int maxAgeMonths) {
        this.required = required;
        this.maxAgeMonths = maxAgeMonths;
    }

    public boolean isRequired() {
        return required;
    }

    /** Maximum age of the document at time of review; 0 means it does not go stale. */
    public int maxAgeMonths() {
        return maxAgeMonths;
    }

    public static Set<KycDocumentType> required() {
        Set<KycDocumentType> set = EnumSet.noneOf(KycDocumentType.class);
        for (KycDocumentType type : values()) {
            if (type.required) {
                set.add(type);
            }
        }
        return set;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/Partner.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/Partner.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "partner")
public class Partner extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "legal_name", nullable = false, length = 200)
    private String legalName;

    @Column(name = "trading_name", length = 200)
    private String tradingName;

    @Column(name = "company_number", nullable = false, length = 20)
    private String companyNumber;

    @Column(name = "vat_number", length = 20)
    private String vatNumber;

    @Column(length = 200)
    private String website;

    @Column(name = "contact_name", nullable = false, length = 120)
    private String contactName;

    @Column(name = "contact_email", nullable = false, length = 200)
    private String contactEmail;

    @Column(name = "contact_phone", length = 30)
    private String contactPhone;

    @Column(name = "address_line1", nullable = false, length = 200)
    private String addressLine1;

    @Column(name = "address_line2", length = 200)
    private String addressLine2;

    @Column(nullable = false, length = 100)
    private String city;

    @Column(nullable = false, length = 10)
    private String postcode;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PartnerStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PartnerTier tier;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "trailing_revenue_minor", nullable = false)
    private long trailingRevenueMinor;

    @Column(name = "tier_evaluated_at")
    private Instant tierEvaluatedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    @Column(name = "channel_manager_id", length = 120)
    private String channelManagerId;

    @OneToMany(mappedBy = "partner", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("uploadedAt DESC")
    private List<KycDocument> documents = new ArrayList<>();

    protected Partner() {
    }

    public Partner(UUID id, String reference, String legalName, String companyNumber, String currency) {
        this.id = id;
        this.reference = reference;
        this.legalName = legalName;
        this.companyNumber = companyNumber;
        this.currency = currency;
        this.status = PartnerStatus.APPLIED;
        this.tier = PartnerTier.REGISTERED;
    }

    public void transitionTo(PartnerStatus next, String reason, Instant at) {
        PartnerStatus.LIFECYCLE.assertTransition(status, next);
        if (next == PartnerStatus.ACTIVE && activatedAt == null) {
            activatedAt = at;
        }
        this.status = next;
        this.statusReason = reason;
    }

    public KycDocument addDocument(KycDocument document) {
        document.setPartner(this);
        documents.add(0, document);
        return document;
    }

    /**
     * The document that counts for a given type is the most recent upload; earlier uploads are
     * kept only as history.
     */
    public Optional<KycDocument> latestDocument(KycDocumentType type) {
        return documents.stream()
                .filter(d -> d.getType() == type)
                .max((a, b) -> a.getUploadedAt().compareTo(b.getUploadedAt()));
    }

    public String displayName() {
        return tradingName == null || tradingName.isBlank() ? legalName : tradingName;
    }

    public UUID getId() {
        return id;
    }

    public String getReference() {
        return reference;
    }

    public String getLegalName() {
        return legalName;
    }

    public void setLegalName(String legalName) {
        this.legalName = legalName;
    }

    public String getTradingName() {
        return tradingName;
    }

    public void setTradingName(String tradingName) {
        this.tradingName = tradingName;
    }

    public String getCompanyNumber() {
        return companyNumber;
    }

    public String getVatNumber() {
        return vatNumber;
    }

    public void setVatNumber(String vatNumber) {
        this.vatNumber = vatNumber;
    }

    public String getWebsite() {
        return website;
    }

    public void setWebsite(String website) {
        this.website = website;
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

    public String getContactPhone() {
        return contactPhone;
    }

    public void setContactPhone(String contactPhone) {
        this.contactPhone = contactPhone;
    }

    public String getAddressLine1() {
        return addressLine1;
    }

    public void setAddressLine1(String addressLine1) {
        this.addressLine1 = addressLine1;
    }

    public String getAddressLine2() {
        return addressLine2;
    }

    public void setAddressLine2(String addressLine2) {
        this.addressLine2 = addressLine2;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getPostcode() {
        return postcode;
    }

    public void setPostcode(String postcode) {
        this.postcode = postcode;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        this.countryCode = countryCode;
    }

    public PartnerStatus getStatus() {
        return status;
    }

    public PartnerTier getTier() {
        return tier;
    }

    public void setTier(PartnerTier tier, Instant evaluatedAt) {
        this.tier = tier;
        this.tierEvaluatedAt = evaluatedAt;
    }

    public String getCurrency() {
        return currency;
    }

    public long getTrailingRevenueMinor() {
        return trailingRevenueMinor;
    }

    public void setTrailingRevenueMinor(long trailingRevenueMinor) {
        this.trailingRevenueMinor = trailingRevenueMinor;
    }

    public Instant getTierEvaluatedAt() {
        return tierEvaluatedAt;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public String getChannelManagerId() {
        return channelManagerId;
    }

    public void setChannelManagerId(String channelManagerId) {
        this.channelManagerId = channelManagerId;
    }

    public List<KycDocument> getDocuments() {
        return documents;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerController.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycChecklist;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycReviewRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerApplicationRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerProfileUpdateRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerSummary;
import com.uniti.partnerportal.partner.dto.PartnerDtos.StatusChangeRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierEvaluationResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Partners", description = "Onboarding, KYC and partner lifecycle")
public class PartnerController {

    private final PartnerService service;
    private final TierEvaluationService tiers;
    private final PartnerMapper mapper;
    private final CurrentUserProvider currentUser;

    public PartnerController(PartnerService service, TierEvaluationService tiers, PartnerMapper mapper,
                             CurrentUserProvider currentUser) {
        this.service = service;
        this.tiers = tiers;
        this.mapper = mapper;
        this.currentUser = currentUser;
    }

    @PostMapping("/onboarding/applications")
    @Operation(summary = "Apply to the partner programme", description = "Unauthenticated public endpoint")
    public ResponseEntity<PartnerResponse> apply(@Valid @RequestBody PartnerApplicationRequest request) {
        Partner partner = service.apply(request);
        return ResponseEntity.created(URI.create("/api/v1/partners/" + partner.getId()))
                .body(mapper.toResponse(partner));
    }

    @GetMapping("/partners")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Search partners (internal)")
    public PageResponse<PartnerSummary> search(@RequestParam(required = false) PartnerStatus status,
                                               @RequestParam(required = false) PartnerTier tier,
                                               @RequestParam(required = false) String q,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer pageSize) {
        return PageResponse.from(service.search(status, tier, q, PageResponse.pageable(page, pageSize)),
                mapper::toSummary);
    }

    @GetMapping("/partners/me")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "The signed-in user's partner organisation")
    public PartnerResponse me() {
        var user = currentUser.get();
        return mapper.toResponse(service.get(user.requirePartnerId(), user));
    }

    @GetMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PartnerResponse get(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.get(partnerId, currentUser.get()));
    }

    @PutMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Update contact and address details")
    public PartnerResponse update(@PathVariable UUID partnerId,
                                  @Valid @RequestBody PartnerProfileUpdateRequest request) {
        return mapper.toResponse(service.updateProfile(partnerId, request, currentUser.get()));
    }

    @GetMapping("/partners/{partnerId}/kyc/documents")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public List<KycDocumentResponse> documents(@PathVariable UUID partnerId) {
        return service.get(partnerId, currentUser.get()).getDocuments().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/partners/{partnerId}/kyc/documents")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Register an uploaded KYC document",
            description = "The file itself is uploaded to object storage first; this records its key and digest")
    public KycDocumentResponse upload(@PathVariable UUID partnerId, @Valid @RequestBody KycDocumentRequest request) {
        return mapper.toResponse(service.uploadDocument(partnerId, request, currentUser.get()));
    }

    @GetMapping("/partners/{partnerId}/kyc/checklist")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public KycChecklist checklist(@PathVariable UUID partnerId) {
        return service.checklist(partnerId, currentUser.get());
    }

    @PostMapping("/partners/{partnerId}/kyc/submit")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Submit KYC for review")
    public PartnerResponse submit(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.submitForReview(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/kyc/documents/{documentId}/review")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Verify or reject a KYC document (internal)")
    public KycDocumentResponse review(@PathVariable UUID partnerId, @PathVariable UUID documentId,
                                      @Valid @RequestBody KycReviewRequest request) {
        return mapper.toResponse(service.reviewDocument(partnerId, documentId, request, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/accept")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Accept an application and open KYC (internal)")
    public PartnerResponse accept(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.acceptApplication(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Activate a partner whose KYC is fully verified (internal)")
    public PartnerResponse approve(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.approve(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/rework")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse rework(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.returnForRework(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/reject")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse reject(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.reject(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/suspend")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse suspend(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.suspend(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/reinstate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse reinstate(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.reinstate(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/terminate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse terminate(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.terminate(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/tier/evaluate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Re-evaluate the partner's tier now (internal)")
    public TierEvaluationResponse evaluateTier(@PathVariable UUID partnerId) {
        return tiers.evaluate(partnerId);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerMapper.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerMapper.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerSummary;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierBenefits;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

@Component
public class PartnerMapper {

    private final Clock clock;

    public PartnerMapper(Clock clock) {
        this.clock = clock;
    }

    public PartnerResponse toResponse(Partner p) {
        PartnerTier tier = p.getTier();
        return new PartnerResponse(
                p.getId(),
                p.getReference(),
                p.getLegalName(),
                p.getTradingName(),
                p.getCompanyNumber(),
                p.getVatNumber(),
                p.getWebsite(),
                p.getContactName(),
                p.getContactEmail(),
                p.getContactPhone(),
                p.getAddressLine1(),
                p.getAddressLine2(),
                p.getCity(),
                p.getPostcode(),
                p.getCountryCode(),
                p.getStatus(),
                p.getStatusReason(),
                tier,
                new TierBenefits(tier.commissionRateBps(), tier.selfApprovedDiscountPercent(),
                        tier.mdfAccrualBps(), tier.seatLimit()),
                p.getTrailingRevenueMinor(),
                p.getCurrency(),
                p.getTierEvaluatedAt(),
                p.getActivatedAt(),
                p.getCreatedAt());
    }

    public PartnerSummary toSummary(Partner p) {
        return new PartnerSummary(p.getId(), p.getReference(), p.displayName(), p.getStatus(), p.getTier(),
                p.getCreatedAt());
    }

    public KycDocumentResponse toResponse(KycDocument d) {
        return new KycDocumentResponse(
                d.getId(),
                d.getType(),
                d.getFileName(),
                d.getStatus(),
                d.getIssuedOn(),
                d.getUploadedAt(),
                d.getUploadedBy(),
                d.getReviewedAt(),
                d.getReviewedBy(),
                d.getRejectionReason(),
                d.isStale(LocalDate.now(clock)));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerRepository.java`.

```java
package com.uniti.partnerportal.partner;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerRepository extends JpaRepository<Partner, UUID> {

    Optional<Partner> findByReference(String reference);

    boolean existsByCompanyNumberIgnoreCaseAndStatusIn(String companyNumber, Collection<PartnerStatus> statuses);

    List<Partner> findByStatus(PartnerStatus status);

    @Query("""
            SELECT p FROM Partner p
            WHERE (:status IS NULL OR p.status = :status)
              AND (:tier IS NULL OR p.tier = :tier)
              AND (:search IS NULL
                   OR LOWER(p.legalName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(p.tradingName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR p.reference = :search)
            """)
    Page<Partner> search(@Param("status") PartnerStatus status,
                         @Param("tier") PartnerTier tier,
                         @Param("search") String search,
                         Pageable pageable);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerService.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.partner.dto.PartnerDtos.ChecklistItem;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycChecklist;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycReviewRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerApplicationRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerProfileUpdateRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Partner onboarding (application, KYC evidence, review, activation) and lifecycle control
 * (suspension, reinstatement, termination). Also the single place other modules ask whether a
 * partner is allowed to transact.
 */
@Service
@Transactional
public class PartnerService {

    private static final Logger log = LoggerFactory.getLogger(PartnerService.class);
    private static final EnumSet<PartnerStatus> LIVE_STATUSES = EnumSet.of(
            PartnerStatus.APPLIED, PartnerStatus.KYC_PENDING, PartnerStatus.KYC_UNDER_REVIEW,
            PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED);
    private static final EnumSet<PartnerStatus> DOCUMENT_UPLOAD_STATUSES = EnumSet.of(
            PartnerStatus.APPLIED, PartnerStatus.KYC_PENDING, PartnerStatus.ACTIVE);

    private final PartnerRepository partners;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public PartnerService(PartnerRepository partners, ReferenceGenerator references,
                          PortalProperties properties, Clock clock) {
        this.partners = partners;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    public Partner apply(PartnerApplicationRequest request) {
        String companyNumber = request.companyNumber().toUpperCase(Locale.ROOT);
        if (partners.existsByCompanyNumberIgnoreCaseAndStatusIn(companyNumber, LIVE_STATUSES)) {
            throw new PortalException.Conflict("partner.duplicate_company",
                    "An application or partnership already exists for company " + companyNumber);
        }
        Partner partner = new Partner(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.PARTNER),
                request.legalName().trim(), companyNumber, properties.pricing().defaultCurrency());
        partner.setTradingName(blankToNull(request.tradingName()));
        partner.setVatNumber(blankToNull(request.vatNumber()));
        partner.setWebsite(blankToNull(request.website()));
        partner.setContactName(request.contactName().trim());
        partner.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        partner.setContactPhone(blankToNull(request.contactPhone()));
        partner.setAddressLine1(request.addressLine1().trim());
        partner.setAddressLine2(blankToNull(request.addressLine2()));
        partner.setCity(request.city().trim());
        partner.setPostcode(normalisePostcode(request.postcode()));
        partner.setCountryCode(request.countryCode());
        Partner saved = partners.save(partner);
        log.info("partner_applied partnerId={} reference={}", saved.getId(), saved.getReference());
        return saved;
    }

    @Transactional(readOnly = true)
    public Partner get(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        return load(partnerId);
    }

    @Transactional(readOnly = true)
    public Page<Partner> search(PartnerStatus status, PartnerTier tier, String search, Pageable pageable) {
        String term = search == null || search.isBlank() ? null : search.trim();
        return partners.search(status, tier, term, pageable);
    }

    public Partner updateProfile(UUID partnerId, PartnerProfileUpdateRequest request, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        if (partner.getStatus() == PartnerStatus.TERMINATED || partner.getStatus() == PartnerStatus.REJECTED) {
            throw new PortalException.BusinessRule("partner.closed", "A closed partner profile cannot be edited");
        }
        partner.setTradingName(blankToNull(request.tradingName()));
        partner.setWebsite(blankToNull(request.website()));
        partner.setContactName(request.contactName().trim());
        partner.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        partner.setContactPhone(blankToNull(request.contactPhone()));
        partner.setAddressLine1(request.addressLine1().trim());
        partner.setAddressLine2(blankToNull(request.addressLine2()));
        partner.setCity(request.city().trim());
        partner.setPostcode(normalisePostcode(request.postcode()));
        return partner;
    }

    /**
     * A channel manager accepts the application and takes ownership; the partner can then
     * provide KYC evidence.
     */
    public Partner acceptApplication(UUID partnerId, CurrentUser channelManager) {
        Partner partner = load(partnerId);
        partner.transitionTo(PartnerStatus.KYC_PENDING, null, Instant.now(clock));
        partner.setChannelManagerId(channelManager.subject());
        return partner;
    }

    public KycDocument uploadDocument(UUID partnerId, KycDocumentRequest request, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        if (!DOCUMENT_UPLOAD_STATUSES.contains(partner.getStatus())) {
            throw new PortalException.BusinessRule("kyc.upload_not_allowed",
                    "Documents cannot be uploaded while the partner is " + partner.getStatus());
        }
        boolean duplicate = partner.getDocuments().stream()
                .anyMatch(d -> d.getSha256().equals(request.sha256()) && d.getStatus() != KycDocument.Status.REJECTED);
        if (duplicate) {
            throw new PortalException.Conflict("kyc.duplicate_document", "This file has already been uploaded");
        }
        KycDocument document = new KycDocument(UUID.randomUUID(), request.type(), request.fileName(),
                request.storageKey(), request.sha256(), request.issuedOn(), Instant.now(clock), user.subject());
        if (document.isStale(LocalDate.now(clock))) {
            throw new PortalException.BusinessRule("kyc.document_stale",
                    request.type() + " must be issued within the last " + request.type().maxAgeMonths() + " months");
        }
        return partner.addDocument(document);
    }

    @Transactional(readOnly = true)
    public KycChecklist checklist(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        return buildChecklist(load(partnerId));
    }

    KycChecklist buildChecklist(Partner partner) {
        LocalDate today = LocalDate.now(clock);
        List<ChecklistItem> items = new ArrayList<>();
        boolean allRequiredPresent = true;
        boolean allRequiredVerified = true;
        for (KycDocumentType type : KycDocumentType.values()) {
            Optional<KycDocument> latest = partner.latestDocument(type);
            KycDocument.Status status = latest.map(KycDocument::getStatus).orElse(null);
            boolean stale = latest.map(d -> d.isStale(today)).orElse(false);
            items.add(new ChecklistItem(type, type.isRequired(), status, stale));
            if (type.isRequired()) {
                boolean usable = status != null && status != KycDocument.Status.REJECTED && !stale;
                allRequiredPresent &= usable;
                allRequiredVerified &= usable && status == KycDocument.Status.VERIFIED;
            }
        }
        return new KycChecklist(items, allRequiredPresent, allRequiredVerified);
    }

    public Partner submitForReview(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        KycChecklist checklist = buildChecklist(partner);
        if (!checklist.readyForReview()) {
            List<String> missing = checklist.items().stream()
                    .filter(i -> i.required()
                            && (i.status() == null || i.status() == KycDocument.Status.REJECTED || i.stale()))
                    .map(i -> i.type().name())
                    .toList();
            throw (PortalException) new PortalException.BusinessRule("kyc.incomplete",
                    "Required KYC documents are missing, rejected or out of date").withDetail("missing", missing);
        }
        partner.transitionTo(PartnerStatus.KYC_UNDER_REVIEW, null, Instant.now(clock));
        return partner;
    }

    public KycDocument reviewDocument(UUID partnerId, UUID documentId, KycReviewRequest review,
                                      CurrentUser reviewer) {
        Partner partner = load(partnerId);
        if (partner.getStatus() != PartnerStatus.KYC_UNDER_REVIEW && partner.getStatus() != PartnerStatus.ACTIVE) {
            throw new PortalException.BusinessRule("kyc.not_in_review",
                    "Documents can only be reviewed once the partner has submitted for review");
        }
        KycDocument document = partner.getDocuments().stream()
                .filter(d -> d.getId().equals(documentId))
                .findFirst()
                .orElseThrow(() -> new PortalException.NotFound("KycDocument", documentId));
        if (document.getUploadedBy().equals(reviewer.subject())) {
            throw new PortalException.Forbidden("Reviewers cannot verify documents they uploaded");
        }
        Instant now = Instant.now(clock);
        if (Boolean.TRUE.equals(review.approved())) {
            if (document.isStale(LocalDate.now(clock))) {
                throw new PortalException.BusinessRule("kyc.document_stale", "Document is out of date");
            }
            document.verify(reviewer.subject(), now);
        } else {
            document.reject(reviewer.subject(), now, review.reason());
        }
        return document;
    }

    public Partner approve(UUID partnerId, CurrentUser channelManager) {
        Partner partner = load(partnerId);
        if (!buildChecklist(partner).readyForApproval()) {
            throw new PortalException.BusinessRule("kyc.not_verified",
                    "All required KYC documents must be verified before activation");
        }
        partner.transitionTo(PartnerStatus.ACTIVE, null, Instant.now(clock));
        if (partner.getChannelManagerId() == null) {
            partner.setChannelManagerId(channelManager.subject());
        }
        log.info("partner_activated partnerId={} by={}", partnerId, channelManager.subject());
        return partner;
    }

    public Partner returnForRework(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.KYC_PENDING, reason);
    }

    public Partner reject(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.REJECTED, reason);
    }

    public Partner suspend(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.SUSPENDED, reason);
    }

    public Partner reinstate(UUID partnerId, String reason) {
        Partner partner = load(partnerId);
        if (partner.getStatus() == PartnerStatus.SUSPENDED && !buildChecklist(partner).readyForApproval()) {
            throw new PortalException.BusinessRule("kyc.not_verified",
                    "KYC must be current and verified before a partner can be reinstated");
        }
        partner.transitionTo(PartnerStatus.ACTIVE, reason, Instant.now(clock));
        return partner;
    }

    public Partner terminate(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.TERMINATED, reason);
    }

    /**
     * Guard used by deals, quotes, orders and claims: only an ACTIVE partner can register deals,
     * price, order or claim funds.
     */
    @Transactional(readOnly = true)
    public Partner requireTransactingPartner(UUID partnerId) {
        Partner partner = load(partnerId);
        if (!partner.getStatus().canTransact()) {
            throw new PortalException.BusinessRule("partner.not_active",
                    "Partner " + partner.getReference() + " is " + partner.getStatus() + " and cannot transact");
        }
        return partner;
    }

    @Transactional(readOnly = true)
    public Partner load(UUID partnerId) {
        return partners.findById(partnerId).orElseThrow(() -> new PortalException.NotFound("Partner", partnerId));
    }

    private Partner transition(UUID partnerId, PartnerStatus next, String reason) {
        Partner partner = load(partnerId);
        partner.transitionTo(next, reason, Instant.now(clock));
        log.info("partner_status_changed partnerId={} status={}", partnerId, next);
        return partner;
    }

    static String normalisePostcode(String postcode) {
        String compact = postcode.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (compact.length() < 5) {
            return compact;
        }
        return compact.substring(0, compact.length() - 3) + " " + compact.substring(compact.length() - 3);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerStatus.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerStatus.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * Partner onboarding and lifecycle.
 * <pre>
 * APPLIED -> KYC_PENDING -> KYC_UNDER_REVIEW -> ACTIVE <-> SUSPENDED -> TERMINATED
 *                   ^              |
 *                   +-- (rework) --+--> REJECTED
 * </pre>
 */
public enum PartnerStatus {
    APPLIED,
    KYC_PENDING,
    KYC_UNDER_REVIEW,
    ACTIVE,
    SUSPENDED,
    REJECTED,
    TERMINATED;

    public static final StateMachine<PartnerStatus> LIFECYCLE = StateMachine
            .builder("Partner", PartnerStatus.class)
            .allow(APPLIED, KYC_PENDING, REJECTED)
            .allow(KYC_PENDING, KYC_UNDER_REVIEW, REJECTED)
            .allow(KYC_UNDER_REVIEW, ACTIVE, KYC_PENDING, REJECTED)
            .allow(ACTIVE, SUSPENDED, TERMINATED)
            .allow(SUSPENDED, ACTIVE, TERMINATED)
            .build();

    public boolean canTransact() {
        return this == ACTIVE;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerTier.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/PartnerTier.java`.

```java
package com.uniti.partnerportal.partner;

import java.math.BigDecimal;

/**
 * Programme tiers and the commercial levers attached to each. Thresholds are on trailing
 * twelve-month booked recurring revenue (minor units) plus the number of certified agents, and a
 * partner must meet both to qualify.
 */
public enum PartnerTier {

    REGISTERED(0L, 0, 800, new BigDecimal("5"), 0, 5),
    SILVER(5_000_000L, 2, 1000, new BigDecimal("10"), 100, 15),
    GOLD(25_000_000L, 5, 1250, new BigDecimal("15"), 200, 40),
    PLATINUM(100_000_000L, 10, 1500, new BigDecimal("20"), 300, 150);

    private final long revenueThresholdMinor;
    private final int certifiedAgentsRequired;
    private final int commissionRateBps;
    private final BigDecimal selfApprovedDiscountPercent;
    private final int mdfAccrualBps;
    private final int seatLimit;

    PartnerTier(long revenueThresholdMinor, int certifiedAgentsRequired, int commissionRateBps,
                BigDecimal selfApprovedDiscountPercent, int mdfAccrualBps, int seatLimit) {
        this.revenueThresholdMinor = revenueThresholdMinor;
        this.certifiedAgentsRequired = certifiedAgentsRequired;
        this.commissionRateBps = commissionRateBps;
        this.selfApprovedDiscountPercent = selfApprovedDiscountPercent;
        this.mdfAccrualBps = mdfAccrualBps;
        this.seatLimit = seatLimit;
    }

    public long revenueThresholdMinor() {
        return revenueThresholdMinor;
    }

    public int certifiedAgentsRequired() {
        return certifiedAgentsRequired;
    }

    /** Upfront commission rate applied to first-year recurring revenue, in basis points. */
    public int commissionRateBps() {
        return commissionRateBps;
    }

    /** Discount a partner may give on a quote without Uniti approval. */
    public BigDecimal selfApprovedDiscountPercent() {
        return selfApprovedDiscountPercent;
    }

    /** Share of quarterly booked revenue that accrues into the partner's MDF balance. */
    public int mdfAccrualBps() {
        return mdfAccrualBps;
    }

    /** Maximum number of active portal users. */
    public int seatLimit() {
        return seatLimit;
    }

    public boolean qualifies(long trailingRevenueMinor, int certifiedAgents) {
        return trailingRevenueMinor >= revenueThresholdMinor && certifiedAgents >= certifiedAgentsRequired;
    }

    public PartnerTier oneBelow() {
        return ordinal() == 0 ? this : values()[ordinal() - 1];
    }

    /**
     * Highest tier whose thresholds are met.
     */
    public static PartnerTier highestQualifying(long trailingRevenueMinor, int certifiedAgents) {
        PartnerTier result = REGISTERED;
        for (PartnerTier tier : values()) {
            if (tier.qualifies(trailingRevenueMinor, certifiedAgents)) {
                result = tier;
            }
        }
        return result;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/TierEvaluationService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/TierEvaluationService.java`.

```java
package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierEvaluationResponse;
import com.uniti.partnerportal.users.PartnerUserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Re-computes a partner's programme tier from trailing twelve-month bookings and certified
 * headcount.
 * <ul>
 *   <li>Upgrades take effect immediately, to the highest tier the partner qualifies for.</li>
 *   <li>Downgrades are softened: a partner keeps its tier for a grace period after the last
 *       change, and then drops at most one tier per evaluation.</li>
 * </ul>
 */
@Service
public class TierEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(TierEvaluationService.class);
    static final Duration DOWNGRADE_GRACE = Duration.ofDays(90);

    private final PartnerRepository partners;
    private final PartnerOrderRepository orders;
    private final PartnerUserService users;
    private final Clock clock;

    public TierEvaluationService(PartnerRepository partners, PartnerOrderRepository orders,
                                 PartnerUserService users, Clock clock) {
        this.partners = partners;
        this.orders = orders;
        this.users = users;
        this.clock = clock;
    }

    @Transactional
    public TierEvaluationResponse evaluate(UUID partnerId) {
        Partner partner = partners.findById(partnerId)
                .orElseThrow(() -> new com.uniti.partnerportal.common.error.PortalException.NotFound("Partner", partnerId));
        Instant now = Instant.now(clock);
        Instant since = now.minus(365, ChronoUnit.DAYS);
        long monthly = orders.sumActivatedMonthlyRecurring(partnerId, since);
        long trailing = Math.multiplyExact(monthly, 12L);
        int certified = users.certifiedAgentCount(partnerId);

        Decision decision = decide(partner.getTier(), partner.getTierEvaluatedAt(), trailing, certified, now);
        partner.setTrailingRevenueMinor(trailing);
        if (decision.tier() != partner.getTier()) {
            log.info("partner_tier_changed partnerId={} from={} to={}", partnerId, partner.getTier(), decision.tier());
            partner.setTier(decision.tier(), now);
        }
        return new TierEvaluationResponse(decision.previous(), decision.tier(), trailing, certified,
                decision.previous() != decision.tier(), decision.note());
    }

    /**
     * Pure tier decision, separated for unit testing.
     */
    static Decision decide(PartnerTier current, Instant lastChange, long trailingRevenue, int certifiedAgents,
                           Instant now) {
        PartnerTier qualifying = PartnerTier.highestQualifying(trailingRevenue, certifiedAgents);
        if (qualifying.compareTo(current) > 0) {
            return new Decision(current, qualifying, "Upgraded: thresholds for " + qualifying + " met");
        }
        if (qualifying == current) {
            return new Decision(current, current, "Tier confirmed");
        }
        if (lastChange != null && lastChange.plus(DOWNGRADE_GRACE).isAfter(now)) {
            return new Decision(current, current,
                    "Below " + current + " thresholds; within grace period until " + lastChange.plus(DOWNGRADE_GRACE));
        }
        PartnerTier next = current.oneBelow();
        return new Decision(current, next, "Downgraded one tier; qualifies for " + qualifying);
    }

    /**
     * Quarterly sweep across all active partners (01:30 UTC on the first day of each quarter).
     */
    @Scheduled(cron = "0 30 1 1 1,4,7,10 *", zone = "UTC")
    public void evaluateAllActive() {
        for (Partner partner : partners.findByStatus(PartnerStatus.ACTIVE)) {
            try {
                evaluate(partner.getId());
            } catch (RuntimeException ex) {
                log.error("tier_evaluation_failed partnerId={}", partner.getId(), ex);
            }
        }
    }

    record Decision(PartnerTier previous, PartnerTier tier, String note) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/dto/PartnerDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/partner/dto/PartnerDtos.java`.

```java
package com.uniti.partnerportal.partner.dto;

import com.uniti.partnerportal.partner.KycDocument;
import com.uniti.partnerportal.partner.KycDocumentType;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.partner.PartnerTier;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class PartnerDtos {

    private PartnerDtos() {
    }

    @Schema(description = "Public application to join the Uniti partner programme")
    public record PartnerApplicationRequest(
            @NotBlank @Size(max = 200) String legalName,
            @Size(max = 200) String tradingName,
            @NotBlank @Pattern(regexp = "^[A-Z0-9]{8}$", message = "must be an 8-character company registration number")
            String companyNumber,
            @Pattern(regexp = "^(GB)?[0-9]{9}([0-9]{3})?$", message = "must be a valid VAT number") String vatNumber,
            @Size(max = 200) @Pattern(regexp = "^https?://.+", message = "must be an http(s) URL") String website,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$", message = "must be a valid phone number") String contactPhone,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String postcode,
            @NotBlank @Pattern(regexp = "^[A-Z]{2}$") String countryCode,
            boolean acceptedProgrammeTerms) {

        @AssertTrue(message = "programme terms must be accepted")
        public boolean isTermsAccepted() {
            return acceptedProgrammeTerms;
        }
    }

    public record PartnerProfileUpdateRequest(
            @Size(max = 200) String tradingName,
            @Size(max = 200) @Pattern(regexp = "^https?://.+") String website,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$") String contactPhone,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$") String postcode) {
    }

    public record PartnerResponse(
            UUID id,
            String reference,
            String legalName,
            String tradingName,
            String companyNumber,
            String vatNumber,
            String website,
            String contactName,
            String contactEmail,
            String contactPhone,
            String addressLine1,
            String addressLine2,
            String city,
            String postcode,
            String countryCode,
            PartnerStatus status,
            String statusReason,
            PartnerTier tier,
            TierBenefits tierBenefits,
            long trailingRevenueMinor,
            String currency,
            Instant tierEvaluatedAt,
            Instant activatedAt,
            Instant createdAt) {
    }

    public record TierBenefits(int commissionRateBps,
                               BigDecimal selfApprovedDiscountPercent,
                               int mdfAccrualBps,
                               int seatLimit) {
    }

    public record PartnerSummary(UUID id, String reference, String displayName, PartnerStatus status,
                                 PartnerTier tier, Instant createdAt) {
    }

    public record KycDocumentRequest(
            @NotNull KycDocumentType type,
            @NotBlank @Size(max = 255) String fileName,
            @NotBlank @Size(max = 500) String storageKey,
            @NotBlank @Pattern(regexp = "^[a-f0-9]{64}$", message = "must be a hex SHA-256 digest") String sha256,
            @PastOrPresent LocalDate issuedOn) {
    }

    public record KycDocumentResponse(UUID id, KycDocumentType type, String fileName, KycDocument.Status status,
                                      LocalDate issuedOn, Instant uploadedAt, String uploadedBy,
                                      Instant reviewedAt, String reviewedBy, String rejectionReason,
                                      boolean stale) {
    }

    public record KycReviewRequest(@NotNull Boolean approved, @Size(max = 500) String reason) {

        @AssertTrue(message = "a reason is required when rejecting a document")
        public boolean isReasonPresentWhenRejected() {
            return approved == null || approved || (reason != null && !reason.isBlank());
        }
    }

    public record KycChecklist(List<ChecklistItem> items, boolean readyForReview, boolean readyForApproval) {
    }

    public record ChecklistItem(KycDocumentType type, boolean required, KycDocument.Status status, boolean stale) {
    }

    public record StatusChangeRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record TierEvaluationResponse(PartnerTier previousTier, PartnerTier newTier, long trailingRevenueMinor,
                                         int certifiedAgents, boolean changed, String note) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/ApprovalLevel.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/ApprovalLevel.java`.

```java
package com.uniti.partnerportal.quotes;

/**
 * Who must sign off a quote's discount.
 * <ul>
 *   <li>{@code NONE}: within the partner's self-approved allowance.</li>
 *   <li>{@code CHANNEL_MANAGER}: one Uniti channel manager approval.</li>
 *   <li>{@code DEAL_DESK}: two approvals from distinct channel managers.</li>
 * </ul>
 */
public enum ApprovalLevel {
    NONE(0),
    CHANNEL_MANAGER(1),
    DEAL_DESK(2);

    private final int approvalsRequired;

    ApprovalLevel(int approvalsRequired) {
        this.approvalsRequired = approvalsRequired;
    }

    public int approvalsRequired() {
        return approvalsRequired;
    }
}
```

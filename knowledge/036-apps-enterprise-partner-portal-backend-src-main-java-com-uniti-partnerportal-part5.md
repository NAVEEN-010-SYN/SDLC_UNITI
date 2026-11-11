# Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 5 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/Quote.java` (347 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteApproval.java` (99 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteController.java` (163 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteLine.java` (144 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuotePricingEngine.java` (179 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteRepository.java` (40 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteService.java` (336 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteStatus.java` (39 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/dto/QuoteDtos.java` (117 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUser.java` (186 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserController.java` (106 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserRepository.java` (45 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserService.java` (196 lines)

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/Quote.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/Quote.java`.

```java
package com.uniti.partnerportal.quotes;

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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "quote")
public class Quote extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "deal_id")
    private UUID dealId;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Column(name = "customer_account_id", length = 12)
    private String customerAccountId;

    @Column(name = "customer_contact_email", nullable = false, length = 200)
    private String customerContactEmail;

    @Column(name = "term_months", nullable = false)
    private int termMonths;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QuoteStatus status;

    @Column(nullable = false)
    private int revision;

    @Column(name = "requested_discount_percent", nullable = false, precision = 6, scale = 3)
    private BigDecimal requestedDiscountPercent;

    @Column(name = "effective_discount_percent", nullable = false, precision = 6, scale = 3)
    private BigDecimal effectiveDiscountPercent;

    @Column(name = "list_mrc_minor", nullable = false)
    private long listMrcMinor;

    @Column(name = "term_discount_minor", nullable = false)
    private long termDiscountMinor;

    @Column(name = "volume_discount_minor", nullable = false)
    private long volumeDiscountMinor;

    @Column(name = "partner_discount_minor", nullable = false)
    private long partnerDiscountMinor;

    @Column(name = "net_mrc_minor", nullable = false)
    private long netMrcMinor;

    @Column(name = "nrc_minor", nullable = false)
    private long nrcMinor;

    @Column(name = "nrc_waived", nullable = false)
    private boolean nrcWaived;

    @Column(name = "total_contract_value_minor", nullable = false)
    private long totalContractValueMinor;

    @Enumerated(EnumType.STRING)
    @Column(name = "approval_level", nullable = false, length = 20)
    private ApprovalLevel approvalLevel;

    @Column(name = "justification", length = 1000)
    private String justification;

    @Column(name = "valid_until")
    private Instant validUntil;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "closed_reason", length = 500)
    private String closedReason;

    @OneToMany(mappedBy = "quote", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo")
    private List<QuoteLine> lines = new ArrayList<>();

    @OneToMany(mappedBy = "quote", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("decidedAt")
    private List<QuoteApproval> approvals = new ArrayList<>();

    protected Quote() {
    }

    public Quote(UUID id, String reference, UUID partnerId, String currency) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.currency = currency;
        this.status = QuoteStatus.DRAFT;
        this.revision = 1;
        this.requestedDiscountPercent = BigDecimal.ZERO;
        this.effectiveDiscountPercent = BigDecimal.ZERO;
        this.approvalLevel = ApprovalLevel.NONE;
    }

    public void transitionTo(QuoteStatus next) {
        QuoteStatus.LIFECYCLE.assertTransition(status, next);
        this.status = next;
    }

    /**
     * Returns the quote to DRAFT as a new revision. Approvals recorded against earlier revisions
     * remain for audit but no longer count.
     */
    public void revise() {
        transitionTo(QuoteStatus.DRAFT);
        this.revision++;
        this.validUntil = null;
        this.sentAt = null;
    }

    public void replaceLines(List<QuoteLine> newLines) {
        lines.clear();
        for (QuoteLine line : newLines) {
            line.setQuote(this);
            lines.add(line);
        }
    }

    public void addApproval(QuoteApproval approval) {
        approval.setQuote(this);
        approvals.add(approval);
    }

    public long approvalsForCurrentRevision() {
        return approvals.stream()
                .filter(a -> a.getRevision() == revision && a.getDecision() == QuoteApproval.Decision.APPROVED)
                .map(QuoteApproval::getApprover)
                .distinct()
                .count();
    }

    public boolean hasApprovalFrom(String approver) {
        return approvals.stream().anyMatch(a -> a.getRevision() == revision && a.getApprover().equals(approver));
    }

    public void applyPricing(QuotePricingEngine.PricingResult pricing) {
        this.listMrcMinor = pricing.listMrc().amountMinor();
        this.termDiscountMinor = pricing.termDiscount().amountMinor();
        this.volumeDiscountMinor = pricing.volumeDiscount().amountMinor();
        this.partnerDiscountMinor = pricing.partnerDiscount().amountMinor();
        this.netMrcMinor = pricing.netMrc().amountMinor();
        this.nrcMinor = pricing.nrc().amountMinor();
        this.nrcWaived = pricing.nrcWaived();
        this.totalContractValueMinor = pricing.totalContractValue().amountMinor();
        this.effectiveDiscountPercent = pricing.effectiveDiscountPercent();
        this.approvalLevel = pricing.approvalLevel();
        for (int i = 0; i < lines.size(); i++) {
            lines.get(i).setNetMrcMinor(pricing.lineNetMrc().get(i).amountMinor());
        }
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

    public void setCustomerAccountId(String customerAccountId) {
        this.customerAccountId = customerAccountId;
    }

    public String getCustomerContactEmail() {
        return customerContactEmail;
    }

    public void setCustomerContactEmail(String customerContactEmail) {
        this.customerContactEmail = customerContactEmail;
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

    public QuoteStatus getStatus() {
        return status;
    }

    public int getRevision() {
        return revision;
    }

    public BigDecimal getRequestedDiscountPercent() {
        return requestedDiscountPercent;
    }

    public void setRequestedDiscountPercent(BigDecimal requestedDiscountPercent) {
        this.requestedDiscountPercent = requestedDiscountPercent;
    }

    public BigDecimal getEffectiveDiscountPercent() {
        return effectiveDiscountPercent;
    }

    public long getListMrcMinor() {
        return listMrcMinor;
    }

    public long getTermDiscountMinor() {
        return termDiscountMinor;
    }

    public long getVolumeDiscountMinor() {
        return volumeDiscountMinor;
    }

    public long getPartnerDiscountMinor() {
        return partnerDiscountMinor;
    }

    public long getNetMrcMinor() {
        return netMrcMinor;
    }

    public long getNrcMinor() {
        return nrcMinor;
    }

    public boolean isNrcWaived() {
        return nrcWaived;
    }

    public long getTotalContractValueMinor() {
        return totalContractValueMinor;
    }

    public ApprovalLevel getApprovalLevel() {
        return approvalLevel;
    }

    public String getJustification() {
        return justification;
    }

    public void setJustification(String justification) {
        this.justification = justification;
    }

    public Instant getValidUntil() {
        return validUntil;
    }

    public void setValidUntil(Instant validUntil) {
        this.validUntil = validUntil;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public void setAcceptedAt(Instant acceptedAt) {
        this.acceptedAt = acceptedAt;
    }

    public String getClosedReason() {
        return closedReason;
    }

    public void setClosedReason(String closedReason) {
        this.closedReason = closedReason;
    }

    public List<QuoteLine> getLines() {
        return lines;
    }

    public List<QuoteApproval> getApprovals() {
        return approvals;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteApproval.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteApproval.java`.

```java
package com.uniti.partnerportal.quotes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * An approval or rejection decision recorded against a specific pricing of a quote. The
 * discount at decision time is stored so a later revision cannot inherit a stale approval.
 */
@Entity
@Table(name = "quote_approval")
public class QuoteApproval {

    public enum Decision { APPROVED, REJECTED }

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quote_id")
    private Quote quote;

    @Column(name = "revision", nullable = false)
    private int revision;

    @Column(name = "approver", nullable = false, length = 120)
    private String approver;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Decision decision;

    @Column(name = "discount_percent", nullable = false, precision = 6, scale = 3)
    private BigDecimal discountPercent;

    @Column(length = 500)
    private String note;

    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt;

    protected QuoteApproval() {
    }

    public QuoteApproval(UUID id, int revision, String approver, Decision decision, BigDecimal discountPercent,
                         String note, Instant decidedAt) {
        this.id = id;
        this.revision = revision;
        this.approver = approver;
        this.decision = decision;
        this.discountPercent = discountPercent;
        this.note = note;
        this.decidedAt = decidedAt;
    }

    void setQuote(Quote quote) {
        this.quote = quote;
    }

    public UUID getId() {
        return id;
    }

    public int getRevision() {
        return revision;
    }

    public String getApprover() {
        return approver;
    }

    public Decision getDecision() {
        return decision;
    }

    public BigDecimal getDiscountPercent() {
        return discountPercent;
    }

    public String getNote() {
        return note;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteController.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.PricingPreviewResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteApprovalResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteDecisionRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/quotes")
@Tag(name = "Quotes", description = "Build, price and approve customer quotes")
public class QuoteController {

    public record CustomerDecisionRequest(@NotNull Boolean accepted, @Size(max = 500) String reason) {
    }

    private final QuoteService service;
    private final CurrentUserProvider currentUser;

    public QuoteController(QuoteService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PageResponse<QuoteResponse> search(@RequestParam(required = false) UUID partnerId,
                                              @RequestParam(required = false) QuoteStatus status,
                                              @RequestParam(required = false) UUID dealId,
                                              @RequestParam(required = false) String q,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer pageSize) {
        var result = service.search(partnerId, status, dealId, q, PageResponse.pageable(page, pageSize),
                currentUser.get());
        return PageResponse.from(result, QuoteController::toResponse);
    }

    @GetMapping("/approvals")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Quotes awaiting Uniti approval, oldest first")
    public PageResponse<QuoteResponse> approvalQueue(@RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.ASC, "updatedAt"));
        return PageResponse.from(service.approvalQueue(pageable), QuoteController::toResponse);
    }

    @PostMapping("/preview")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Price a prospective quote without saving it")
    public PricingPreviewResponse preview(@Valid @RequestBody QuoteRequest request) {
        var r = service.preview(request, currentUser.get());
        return new PricingPreviewResponse(r.listMrc().amountMinor(), r.termDiscount().amountMinor(),
                r.volumeDiscount().amountMinor(), r.partnerDiscount().amountMinor(), r.netMrc().amountMinor(),
                r.nrc().amountMinor(), r.nrcWaived(), r.totalContractValue().amountMinor(), r.termDiscountPercent(),
                r.volumeDiscountPercent(), r.effectiveDiscountPercent(), r.selfApprovedAllowancePercent(),
                r.approvalLevel(), r.blockers(), r.listMrc().currency());
    }

    @PostMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public ResponseEntity<QuoteResponse> create(@Valid @RequestBody QuoteRequest request) {
        Quote quote = service.create(request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/quotes/" + quote.getId())).body(toResponse(quote));
    }

    @GetMapping("/{quoteId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse get(@PathVariable UUID quoteId) {
        return toResponse(service.get(quoteId, currentUser.get()));
    }

    @PutMapping("/{quoteId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse update(@PathVariable UUID quoteId, @Valid @RequestBody QuoteRequest request) {
        return toResponse(service.update(quoteId, request, currentUser.get()));
    }

    @PostMapping("/{quoteId}/submit")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Submit for approval", description = "Self-approves within the tier allowance")
    public QuoteResponse submit(@PathVariable UUID quoteId) {
        return toResponse(service.submit(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public QuoteResponse approve(@PathVariable UUID quoteId, @Valid @RequestBody QuoteDecisionRequest request) {
        return toResponse(service.approve(quoteId, request.note(), currentUser.get()));
    }

    @PostMapping("/{quoteId}/reject")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public QuoteResponse reject(@PathVariable UUID quoteId, @Valid @RequestBody QuoteDecisionRequest request) {
        return toResponse(service.reject(quoteId, request.note(), currentUser.get()));
    }

    @PostMapping("/{quoteId}/revise")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Return the quote to draft as a new revision")
    public QuoteResponse revise(@PathVariable UUID quoteId) {
        return toResponse(service.revise(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/send")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse send(@PathVariable UUID quoteId) {
        return toResponse(service.markSent(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/customer-decision")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Record the customer's acceptance or refusal")
    public QuoteResponse customerDecision(@PathVariable UUID quoteId,
                                          @Valid @RequestBody CustomerDecisionRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.recordCustomerDecision(quoteId, request.accepted(), request.reason(), user));
    }

    static QuoteResponse toResponse(Quote q) {
        var lines = q.getLines().stream()
                .map(l -> new QuoteLineResponse(l.getId(), l.getLineNo(), l.getSku(), l.getProductName(),
                        l.getSiteName(), l.getSitePostcode(), l.getQuantity(), l.getUnitMrcMinor(),
                        l.getUnitNrcMinor(), l.listMrcMinor(), l.getNetMrcMinor()))
                .toList();
        var approvals = q.getApprovals().stream()
                .map(a -> new QuoteApprovalResponse(a.getRevision(), a.getApprover(), a.getDecision(),
                        a.getDiscountPercent(), a.getNote(), a.getDecidedAt()))
                .toList();
        return new QuoteResponse(q.getId(), q.getReference(), q.getPartnerId(), q.getDealId(), q.getCustomerName(),
                q.getCustomerAccountId(), q.getCustomerContactEmail(), q.getTermMonths(), q.getCurrency(),
                q.getStatus(), q.getRevision(), q.getRequestedDiscountPercent(), q.getEffectiveDiscountPercent(),
                q.getListMrcMinor(), q.getTermDiscountMinor(), q.getVolumeDiscountMinor(),
                q.getPartnerDiscountMinor(), q.getNetMrcMinor(), q.getNrcMinor(), q.isNrcWaived(),
                q.getTotalContractValueMinor(), q.getApprovalLevel(), q.approvalsForCurrentRevision(),
                q.getJustification(), q.getValidUntil(), q.getSentAt(), q.getAcceptedAt(), q.getClosedReason(),
                lines, approvals, q.getCreatedAt());
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteLine.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteLine.java`.

```java
package com.uniti.partnerportal.quotes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * One product at one site. Product name and prices are snapshotted from the catalog when the
 * line is added so later catalog changes never alter an issued quote.
 */
@Entity
@Table(name = "quote_line")
public class QuoteLine {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quote_id")
    private Quote quote;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(nullable = false, length = 40)
    private String sku;

    @Column(name = "product_name", nullable = false, length = 120)
    private String productName;

    @Column(name = "site_name", nullable = false, length = 120)
    private String siteName;

    @Column(name = "site_postcode", nullable = false, length = 10)
    private String sitePostcode;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_mrc_minor", nullable = false)
    private long unitMrcMinor;

    @Column(name = "unit_nrc_minor", nullable = false)
    private long unitNrcMinor;

    @Column(name = "unit_floor_mrc_minor", nullable = false)
    private long unitFloorMrcMinor;

    @Column(name = "net_mrc_minor", nullable = false)
    private long netMrcMinor;

    protected QuoteLine() {
    }

    public QuoteLine(UUID id, int lineNo, String sku, String productName, String siteName, String sitePostcode,
                     int quantity, long unitMrcMinor, long unitNrcMinor, long unitFloorMrcMinor) {
        this.id = id;
        this.lineNo = lineNo;
        this.sku = sku;
        this.productName = productName;
        this.siteName = siteName;
        this.sitePostcode = sitePostcode;
        this.quantity = quantity;
        this.unitMrcMinor = unitMrcMinor;
        this.unitNrcMinor = unitNrcMinor;
        this.unitFloorMrcMinor = unitFloorMrcMinor;
        this.netMrcMinor = unitMrcMinor * quantity;
    }

    public long listMrcMinor() {
        return unitMrcMinor * quantity;
    }

    public long nrcMinor() {
        return unitNrcMinor * quantity;
    }

    public long floorMrcMinor() {
        return unitFloorMrcMinor * quantity;
    }

    void setQuote(Quote quote) {
        this.quote = quote;
    }

    public UUID getId() {
        return id;
    }

    public Quote getQuote() {
        return quote;
    }

    public int getLineNo() {
        return lineNo;
    }

    public String getSku() {
        return sku;
    }

    public String getProductName() {
        return productName;
    }

    public String getSiteName() {
        return siteName;
    }

    public String getSitePostcode() {
        return sitePostcode;
    }

    public int getQuantity() {
        return quantity;
    }

    public long getUnitMrcMinor() {
        return unitMrcMinor;
    }

    public long getUnitNrcMinor() {
        return unitNrcMinor;
    }

    public long getUnitFloorMrcMinor() {
        return unitFloorMrcMinor;
    }

    public long getNetMrcMinor() {
        return netMrcMinor;
    }

    public void setNetMrcMinor(long netMrcMinor) {
        this.netMrcMinor = netMrcMinor;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuotePricingEngine.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuotePricingEngine.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.money.Money;
import com.uniti.partnerportal.partner.PartnerTier;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Prices a quote and decides the approval it needs. Pure and deterministic so every rule can be
 * unit tested without a database.
 *
 * <h2>Discount stack (applied to monthly recurring charges in this order)</h2>
 * <ol>
 *   <li><b>Term discount</b>: 24 months 5%, 36 months 10%, 60 months 15%.</li>
 *   <li><b>Volume discount</b> on distinct sites: 5+ 3%, 10+ 5%, 25+ 8%.</li>
 *   <li><b>Partner discount</b>: whatever additional percentage the partner requests.</li>
 * </ol>
 * Installation (NRC) is waived on terms of 36 months or more.
 *
 * <h2>Approval matrix (on the partner discount only)</h2>
 * <ul>
 *   <li>Up to the tier's self-approved allowance: no approval. Without a protected deal
 *       registration the allowance is halved, which is the main incentive to register.</li>
 *   <li>Up to allowance + 10 points: one channel manager.</li>
 *   <li>Up to the programme maximum: deal desk (two channel managers).</li>
 *   <li>Above the maximum, or any line priced below its floor: not quotable.</li>
 * </ul>
 */
@Component
public class QuotePricingEngine {

    public static final Set<Integer> ALLOWED_TERMS = Set.of(12, 24, 36, 60);
    static final BigDecimal CHANNEL_MANAGER_BAND = BigDecimal.TEN;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private static final Map<Integer, BigDecimal> TERM_DISCOUNT = Map.of(
            12, BigDecimal.ZERO,
            24, new BigDecimal("5"),
            36, new BigDecimal("10"),
            60, new BigDecimal("15"));

    private static final TreeMap<Integer, BigDecimal> VOLUME_DISCOUNT = new TreeMap<>(Map.of(
            1, BigDecimal.ZERO,
            5, new BigDecimal("3"),
            10, new BigDecimal("5"),
            25, new BigDecimal("8")));

    public record PricingInput(List<QuoteLine> lines, int termMonths, BigDecimal requestedDiscountPercent,
                               PartnerTier tier, boolean hasProtectedDeal, BigDecimal maxDiscountPercent,
                               String currency) {
    }

    public record FloorBreach(int lineNo, String sku, Money netMrc, Money floorMrc) {
    }

    public record PricingResult(Money listMrc,
                                Money termDiscount,
                                Money volumeDiscount,
                                Money partnerDiscount,
                                Money netMrc,
                                List<Money> lineNetMrc,
                                Money nrc,
                                boolean nrcWaived,
                                Money totalContractValue,
                                BigDecimal termDiscountPercent,
                                BigDecimal volumeDiscountPercent,
                                BigDecimal effectiveDiscountPercent,
                                BigDecimal selfApprovedAllowancePercent,
                                ApprovalLevel approvalLevel,
                                List<FloorBreach> floorBreaches,
                                List<String> blockers) {

        public boolean isQuotable() {
            return blockers.isEmpty();
        }
    }

    public PricingResult price(PricingInput input) {
        String ccy = input.currency();
        List<String> blockers = new ArrayList<>();
        if (input.lines().isEmpty()) {
            blockers.add("Quote has no lines");
        }
        if (!ALLOWED_TERMS.contains(input.termMonths())) {
            blockers.add("Term must be one of " + ALLOWED_TERMS + " months");
        }
        BigDecimal requested = input.requestedDiscountPercent() == null ? BigDecimal.ZERO
                : input.requestedDiscountPercent();
        if (requested.signum() < 0) {
            blockers.add("Discount cannot be negative");
            requested = BigDecimal.ZERO;
        }

        BigDecimal termPct = TERM_DISCOUNT.getOrDefault(input.termMonths(), BigDecimal.ZERO);
        int sites = distinctSites(input.lines());
        BigDecimal volumePct = VOLUME_DISCOUNT.floorEntry(Math.max(sites, 1)).getValue();

        Money list = Money.zero(ccy);
        Money nrc = Money.zero(ccy);
        List<Money> lineNet = new ArrayList<>();
        List<FloorBreach> breaches = new ArrayList<>();
        Money termDiscount = Money.zero(ccy);
        Money volumeDiscount = Money.zero(ccy);
        Money partnerDiscount = Money.zero(ccy);

        for (QuoteLine line : input.lines()) {
            Money lineList = Money.of(line.listMrcMinor(), ccy);
            Money afterTerm = lineList.discountBy(termPct);
            Money afterVolume = afterTerm.discountBy(volumePct);
            Money net = afterVolume.discountBy(requested);
            termDiscount = termDiscount.plus(lineList.minus(afterTerm));
            volumeDiscount = volumeDiscount.plus(afterTerm.minus(afterVolume));
            partnerDiscount = partnerDiscount.plus(afterVolume.minus(net));
            list = list.plus(lineList);
            nrc = nrc.plus(Money.of(line.nrcMinor(), ccy));
            lineNet.add(net);
            Money floor = Money.of(line.floorMrcMinor(), ccy);
            if (net.isLessThan(floor)) {
                breaches.add(new FloorBreach(line.getLineNo(), line.getSku(), net, floor));
            }
        }

        Money netMrc = list.minus(termDiscount).minus(volumeDiscount).minus(partnerDiscount);
        boolean waived = input.termMonths() >= 36;
        Money chargedNrc = waived ? Money.zero(ccy) : nrc;
        Money tcv = netMrc.times(input.termMonths()).plus(chargedNrc);

        BigDecimal effective = list.isZero() ? BigDecimal.ZERO
                : BigDecimal.valueOf(list.amountMinor() - netMrc.amountMinor())
                .multiply(HUNDRED)
                .divide(BigDecimal.valueOf(list.amountMinor()), 3, RoundingMode.HALF_EVEN);

        BigDecimal allowance = selfApprovedAllowance(input.tier(), input.hasProtectedDeal());
        ApprovalLevel level = approvalLevel(requested, allowance);
        BigDecimal max = input.maxDiscountPercent();
        if (requested.compareTo(max) > 0) {
            blockers.add("Partner discount " + requested.stripTrailingZeros().toPlainString()
                    + "% exceeds the programme maximum of " + max.stripTrailingZeros().toPlainString() + "%");
        }
        if (!breaches.isEmpty()) {
            blockers.add(breaches.size() + " line(s) priced below the floor price");
        }

        return new PricingResult(list, termDiscount, volumeDiscount, partnerDiscount, netMrc, lineNet, chargedNrc,
                waived, tcv, termPct, volumePct, effective, allowance, level, breaches, blockers);
    }

    static BigDecimal selfApprovedAllowance(PartnerTier tier, boolean hasProtectedDeal) {
        BigDecimal base = tier.selfApprovedDiscountPercent();
        return hasProtectedDeal ? base : base.divide(BigDecimal.valueOf(2), 3, RoundingMode.HALF_EVEN);
    }

    static ApprovalLevel approvalLevel(BigDecimal requested, BigDecimal allowance) {
        if (requested.compareTo(allowance) <= 0) {
            return ApprovalLevel.NONE;
        }
        if (requested.compareTo(allowance.add(CHANNEL_MANAGER_BAND)) <= 0) {
            return ApprovalLevel.CHANNEL_MANAGER;
        }
        return ApprovalLevel.DEAL_DESK;
    }

    static int distinctSites(List<QuoteLine> lines) {
        return lines.stream()
                .map(l -> l.getSitePostcode().replaceAll("\\s+", "").toUpperCase() + "|"
                        + l.getSiteName().trim().toLowerCase())
                .collect(Collectors.toSet())
                .size();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteRepository.java`.

```java
package com.uniti.partnerportal.quotes;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface QuoteRepository extends JpaRepository<Quote, UUID> {

    @Query("""
            SELECT q FROM Quote q
            WHERE (:partnerId IS NULL OR q.partnerId = :partnerId)
              AND (:status IS NULL OR q.status = :status)
              AND (:dealId IS NULL OR q.dealId = :dealId)
              AND (:search IS NULL
                   OR LOWER(q.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR q.reference = :search)
            """)
    Page<Quote> search(@Param("partnerId") UUID partnerId,
                       @Param("status") QuoteStatus status,
                       @Param("dealId") UUID dealId,
                       @Param("search") String search,
                       Pageable pageable);

    Page<Quote> findByStatus(QuoteStatus status, Pageable pageable);

    List<Quote> findByStatusInAndValidUntilBefore(Collection<QuoteStatus> statuses, Instant cutoff);

    long countByPartnerIdAndStatusInAndCreatedAtAfter(UUID partnerId, Collection<QuoteStatus> statuses,
                                                      Instant since);

    long countByPartnerIdAndCreatedAtAfter(UUID partnerId, Instant since);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteService.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Quote lifecycle: build from the catalog, price, route for approval according to the discount
 * matrix, send to the customer and record the customer's decision. Accepted quotes are turned
 * into orders by the orders module.
 */
@Service
@Transactional
public class QuoteService {

    private static final Logger log = LoggerFactory.getLogger(QuoteService.class);

    private final QuoteRepository quotes;
    private final CatalogProductRepository catalog;
    private final QuotePricingEngine pricing;
    private final PartnerService partners;
    private final DealRegistrationService deals;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public QuoteService(QuoteRepository quotes, CatalogProductRepository catalog, QuotePricingEngine pricing,
                        PartnerService partners, DealRegistrationService deals, ReferenceGenerator references,
                        PortalProperties properties, Clock clock) {
        this.quotes = quotes;
        this.catalog = catalog;
        this.pricing = pricing;
        this.partners = partners;
        this.deals = deals;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * Prices a prospective quote without saving it, so the builder can show the discount stack
     * and the approval it will need as the partner edits.
     */
    @Transactional(readOnly = true)
    public QuotePricingEngine.PricingResult preview(QuoteRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        Partner partner = partners.requireTransactingPartner(partnerId);
        List<QuoteLine> lines = buildLines(request.lines(), request.termMonths(), partner.getCurrency());
        return pricing.price(pricingInput(lines, request.termMonths(), request.requestedDiscountPercent(),
                partner, request.dealId()));
    }

    public Quote create(QuoteRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        Partner partner = partners.requireTransactingPartner(partnerId);
        Quote quote = new Quote(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.QUOTE), partnerId,
                partner.getCurrency());
        applyAndPrice(quote, request, partner);
        Quote saved = quotes.save(quote);
        log.info("quote_created quoteRef={} partnerId={} lines={}", saved.getReference(), partnerId,
                saved.getLines().size());
        return saved;
    }

    public Quote update(UUID quoteId, QuoteRequest request, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (!quote.getStatus().isEditable()) {
            throw new PortalException.BusinessRule("quote.not_editable",
                    "Quote " + quote.getReference() + " is " + quote.getStatus() + "; revise it before editing");
        }
        applyAndPrice(quote, request, partners.requireTransactingPartner(quote.getPartnerId()));
        return quote;
    }

    @Transactional(readOnly = true)
    public Quote get(UUID quoteId, CurrentUser user) {
        Quote quote = load(quoteId);
        user.assertCanAccess(quote.getPartnerId());
        return quote;
    }

    @Transactional(readOnly = true)
    public Page<Quote> search(UUID partnerId, QuoteStatus status, UUID dealId, String search, Pageable pageable,
                              CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        String term = search == null || search.isBlank() ? null : search.trim();
        return quotes.search(scope, status, dealId, term, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Quote> approvalQueue(Pageable pageable) {
        return quotes.findByStatus(QuoteStatus.PENDING_APPROVAL, pageable);
    }

    /**
     * Re-prices against the partner's current tier and deal protection, then either self-approves
     * (within allowance) or routes to the approval queue. Anything not quotable is refused with
     * the blockers listed so the builder can show them.
     */
    public Quote submit(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        Partner partner = partners.requireTransactingPartner(quote.getPartnerId());
        QuotePricingEngine.PricingResult result = reprice(quote, partner);
        if (!result.isQuotable()) {
            throw (PortalException) new PortalException.BusinessRule("quote.not_quotable",
                    "The quote cannot be submitted as priced").withDetail("blockers", result.blockers());
        }
        if (result.approvalLevel() == ApprovalLevel.NONE) {
            quote.transitionTo(QuoteStatus.APPROVED);
            quote.setValidUntil(validityFrom(Instant.now(clock)));
            return quote;
        }
        if (quote.getJustification() == null || quote.getJustification().isBlank()) {
            throw new PortalException.BusinessRule("quote.justification_required",
                    "A justification is required for discounts that need Uniti approval");
        }
        quote.transitionTo(QuoteStatus.PENDING_APPROVAL);
        log.info("quote_submitted_for_approval quoteRef={} level={} discount={}", quote.getReference(),
                result.approvalLevel(), quote.getRequestedDiscountPercent());
        return quote;
    }

    /**
     * Records one channel-manager approval. Deal-desk quotes need two distinct approvers, and
     * nobody may approve a quote they raised.
     */
    public Quote approve(UUID quoteId, String note, CurrentUser manager) {
        Quote quote = load(quoteId);
        requirePending(quote);
        assertIndependentApprover(quote, manager);
        Instant now = Instant.now(clock);
        quote.addApproval(new QuoteApproval(UUID.randomUUID(), quote.getRevision(), manager.subject(),
                QuoteApproval.Decision.APPROVED, quote.getRequestedDiscountPercent(), note, now));
        if (quote.approvalsForCurrentRevision() >= quote.getApprovalLevel().approvalsRequired()) {
            quote.transitionTo(QuoteStatus.APPROVED);
            quote.setValidUntil(validityFrom(now));
            log.info("quote_approved quoteRef={} revision={}", quote.getReference(), quote.getRevision());
        }
        return quote;
    }

    public Quote reject(UUID quoteId, String note, CurrentUser manager) {
        Quote quote = load(quoteId);
        requirePending(quote);
        assertIndependentApprover(quote, manager);
        quote.addApproval(new QuoteApproval(UUID.randomUUID(), quote.getRevision(), manager.subject(),
                QuoteApproval.Decision.REJECTED, quote.getRequestedDiscountPercent(), note, Instant.now(clock)));
        quote.transitionTo(QuoteStatus.REJECTED);
        quote.setClosedReason(note);
        return quote;
    }

    public Quote revise(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        quote.revise();
        quote.setClosedReason(null);
        return quote;
    }

    public Quote markSent(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        assertStillValid(quote);
        quote.transitionTo(QuoteStatus.SENT);
        quote.setSentAt(Instant.now(clock));
        return quote;
    }

    public Quote recordCustomerDecision(UUID quoteId, boolean accepted, String reason, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (accepted) {
            assertStillValid(quote);
            quote.transitionTo(QuoteStatus.ACCEPTED);
            quote.setAcceptedAt(Instant.now(clock));
        } else {
            quote.transitionTo(QuoteStatus.DECLINED);
            quote.setClosedReason(reason);
        }
        return quote;
    }

    /**
     * Used by the orders module: only an accepted quote of the caller's partner can be ordered.
     */
    public Quote claimForOrder(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (quote.getStatus() != QuoteStatus.ACCEPTED) {
            throw new PortalException.BusinessRule("quote.not_accepted",
                    "Only accepted quotes can be ordered; " + quote.getReference() + " is " + quote.getStatus());
        }
        quote.transitionTo(QuoteStatus.ORDERED);
        return quote;
    }

    @Scheduled(cron = "0 5 0 * * *", zone = "UTC")
    public void expireLapsedQuotes() {
        List<Quote> lapsed = quotes.findByStatusInAndValidUntilBefore(
                EnumSet.of(QuoteStatus.APPROVED, QuoteStatus.SENT), Instant.now(clock));
        lapsed.forEach(q -> {
            q.transitionTo(QuoteStatus.EXPIRED);
            q.setClosedReason("Validity period lapsed");
        });
        if (!lapsed.isEmpty()) {
            log.info("quotes_expired count={}", lapsed.size());
        }
    }

    private void applyAndPrice(Quote quote, QuoteRequest request, Partner partner) {
        if (request.dealId() != null) {
            deals.requireQuotableDeal(request.dealId(), partner.getId());
        }
        quote.setDealId(request.dealId());
        quote.setCustomerName(request.customerName().trim());
        quote.setCustomerAccountId(request.customerAccountId());
        quote.setCustomerContactEmail(request.customerContactEmail().trim().toLowerCase(Locale.ROOT));
        quote.setTermMonths(request.termMonths());
        quote.setRequestedDiscountPercent(request.requestedDiscountPercent());
        quote.setJustification(request.justification() == null ? null : request.justification().trim());
        quote.replaceLines(buildLines(request.lines(), request.termMonths(), quote.getCurrency()));
        reprice(quote, partner);
    }

    private QuotePricingEngine.PricingResult reprice(Quote quote, Partner partner) {
        QuotePricingEngine.PricingResult result = pricing.price(pricingInput(quote.getLines(), quote.getTermMonths(),
                quote.getRequestedDiscountPercent(), partner, quote.getDealId()));
        quote.applyPricing(result);
        return result;
    }

    private QuotePricingEngine.PricingInput pricingInput(List<QuoteLine> lines, int termMonths, BigDecimal discount,
                                                         Partner partner, UUID dealId) {
        boolean protectedDeal = dealId != null;
        BigDecimal max = BigDecimal.valueOf(properties.pricing().maxDiscountPercent());
        return new QuotePricingEngine.PricingInput(lines, termMonths, discount, partner.getTier(), protectedDeal, max,
                partner.getCurrency());
    }

    /**
     * Snapshots catalog prices into quote lines. Unknown or retired SKUs, currency mismatches and
     * products whose minimum term exceeds the quote term are rejected up front.
     */
    List<QuoteLine> buildLines(List<QuoteLineRequest> requested, int termMonths, String currency) {
        Map<String, CatalogProduct> bySku = catalog.findBySkuIn(
                        requested.stream().map(QuoteLineRequest::sku).collect(Collectors.toSet())).stream()
                .filter(CatalogProduct::isActive)
                .collect(Collectors.toMap(CatalogProduct::getSku, Function.identity()));
        List<String> problems = new ArrayList<>();
        List<QuoteLine> lines = new ArrayList<>();
        int lineNo = 1;
        for (QuoteLineRequest r : requested) {
            CatalogProduct product = bySku.get(r.sku());
            if (product == null) {
                problems.add(r.sku() + " is not an available product");
                continue;
            }
            if (!product.getCurrency().equals(currency)) {
                problems.add(r.sku() + " is priced in " + product.getCurrency() + ", not " + currency);
                continue;
            }
            if (termMonths < product.getMinTermMonths()) {
                problems.add(r.sku() + " requires a minimum term of " + product.getMinTermMonths() + " months");
                continue;
            }
            int quantity = product.isPerSite() ? 1 : r.quantity();
            lines.add(new QuoteLine(UUID.randomUUID(), lineNo++, product.getSku(), product.getName(),
                    r.siteName().trim(), r.sitePostcode().trim().toUpperCase(Locale.ROOT), quantity,
                    product.getMonthlyPriceMinor(), product.getInstallPriceMinor(),
                    product.getFloorMonthlyPriceMinor()));
        }
        if (!problems.isEmpty()) {
            throw (PortalException) new PortalException.BusinessRule("quote.invalid_lines",
                    "One or more quote lines are invalid").withDetail("problems", problems);
        }
        return lines;
    }

    private void assertIndependentApprover(Quote quote, CurrentUser manager) {
        if (manager.subject().equals(quote.getCreatedBy())) {
            throw new PortalException.Forbidden("You cannot approve a quote you raised");
        }
        if (quote.hasApprovalFrom(manager.subject())) {
            throw new PortalException.Conflict("quote.already_decided",
                    "You have already recorded a decision on this revision");
        }
    }

    private static void requirePending(Quote quote) {
        if (quote.getStatus() != QuoteStatus.PENDING_APPROVAL) {
            throw new PortalException.BusinessRule("quote.not_pending",
                    "Quote " + quote.getReference() + " is not awaiting approval");
        }
    }

    private void assertStillValid(Quote quote) {
        if (quote.getValidUntil() != null && quote.getValidUntil().isBefore(Instant.now(clock))) {
            throw new PortalException.BusinessRule("quote.expired",
                    "Quote " + quote.getReference() + " expired on " + quote.getValidUntil());
        }
    }

    private Instant validityFrom(Instant from) {
        return from.plus(properties.pricing().quoteValidityDays(), ChronoUnit.DAYS);
    }

    private Quote load(UUID quoteId) {
        return quotes.findById(quoteId).orElseThrow(() -> new PortalException.NotFound("Quote", quoteId));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteStatus.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/QuoteStatus.java`.

```java
package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * <pre>
 * DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> ACCEPTED -> ORDERED
 *   ^            |                |         |-> DECLINED
 *   +--- REJECTED <               +-> EXPIRED (validity lapsed)
 * </pre>
 * A quote can be revised back to DRAFT until it is accepted, which voids any approval.
 */
public enum QuoteStatus {
    DRAFT,
    PENDING_APPROVAL,
    APPROVED,
    REJECTED,
    SENT,
    ACCEPTED,
    DECLINED,
    EXPIRED,
    ORDERED;

    public static final StateMachine<QuoteStatus> LIFECYCLE = StateMachine
            .builder("Quote", QuoteStatus.class)
            .allow(DRAFT, PENDING_APPROVAL, APPROVED)
            .allow(PENDING_APPROVAL, APPROVED, REJECTED, DRAFT)
            .allow(REJECTED, DRAFT)
            .allow(APPROVED, SENT, DRAFT, EXPIRED)
            .allow(SENT, ACCEPTED, DECLINED, EXPIRED, DRAFT)
            .allow(ACCEPTED, ORDERED)
            .allow(EXPIRED, DRAFT)
            .build();

    public boolean isEditable() {
        return this == DRAFT;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/dto/QuoteDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/quotes/dto/QuoteDtos.java`.

```java
package com.uniti.partnerportal.quotes.dto;

import com.uniti.partnerportal.quotes.ApprovalLevel;
import com.uniti.partnerportal.quotes.QuoteApproval;
import com.uniti.partnerportal.quotes.QuoteStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class QuoteDtos {

    private QuoteDtos() {
    }

    public record QuoteLineRequest(
            @NotBlank @Size(max = 40) String sku,
            @NotBlank @Size(max = 120) String siteName,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String sitePostcode,
            @Min(1) @Max(100) int quantity) {
    }

    public record QuoteRequest(
            UUID partnerId,
            UUID dealId,
            @NotBlank @Size(max = 200) String customerName,
            @Pattern(regexp = "^ACC-\\d{8}$", message = "must be an account ID like ACC-12345678") String customerAccountId,
            @NotBlank @Email @Size(max = 200) String customerContactEmail,
            @NotNull Integer termMonths,
            @NotNull @DecimalMin("0.0") @DecimalMax("100.0") @Digits(integer = 3, fraction = 3)
            BigDecimal requestedDiscountPercent,
            @Size(max = 1000) String justification,
            @NotEmpty @Size(max = 200) List<@Valid QuoteLineRequest> lines) {
    }

    public record QuoteDecisionRequest(@NotBlank @Size(max = 500) String note) {
    }

    public record QuoteLineResponse(UUID id, int lineNo, String sku, String productName, String siteName,
                                    String sitePostcode, int quantity, long unitMrcMinor, long unitNrcMinor,
                                    long listMrcMinor, long netMrcMinor) {
    }

    public record QuoteApprovalResponse(int revision, String approver, QuoteApproval.Decision decision,
                                        BigDecimal discountPercent, String note, Instant decidedAt) {
    }

    public record QuoteResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID dealId,
            String customerName,
            String customerAccountId,
            String customerContactEmail,
            int termMonths,
            String currency,
            QuoteStatus status,
            int revision,
            BigDecimal requestedDiscountPercent,
            BigDecimal effectiveDiscountPercent,
            long listMrcMinor,
            long termDiscountMinor,
            long volumeDiscountMinor,
            long partnerDiscountMinor,
            long netMrcMinor,
            long nrcMinor,
            boolean nrcWaived,
            long totalContractValueMinor,
            ApprovalLevel approvalLevel,
            long approvalsReceived,
            String justification,
            Instant validUntil,
            Instant sentAt,
            Instant acceptedAt,
            String closedReason,
            List<QuoteLineResponse> lines,
            List<QuoteApprovalResponse> approvals,
            Instant createdAt) {
    }

    /**
     * Result of a pricing preview: totals plus everything the UI needs to explain the price and
     * whether approval will be required.
     */
    public record PricingPreviewResponse(
            long listMrcMinor,
            long termDiscountMinor,
            long volumeDiscountMinor,
            long partnerDiscountMinor,
            long netMrcMinor,
            long nrcMinor,
            boolean nrcWaived,
            long totalContractValueMinor,
            BigDecimal termDiscountPercent,
            BigDecimal volumeDiscountPercent,
            BigDecimal effectiveDiscountPercent,
            BigDecimal selfApprovedAllowancePercent,
            ApprovalLevel approvalLevel,
            List<String> blockers,
            String currency) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUser.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUser.java`.

```java
package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.domain.AuditableEntity;
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
 * A person at a partner organisation who uses the portal. Identity lives in the IdP; this
 * record holds the programme-specific facts (role, seat, certification).
 */
@Entity
@Table(name = "partner_user")
public class PartnerUser extends AuditableEntity {

    public enum Role { PARTNER_ADMIN, PARTNER_AGENT }

    public enum Status { INVITED, ACTIVE, DEACTIVATED }

    @Id
    private UUID id;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(nullable = false, length = 200)
    private String email;

    @Column(name = "first_name", nullable = false, length = 80)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 80)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "idp_subject", length = 120)
    private String idpSubject;

    @Column(name = "certified_until")
    private LocalDate certifiedUntil;

    @Column(name = "invited_at", nullable = false)
    private Instant invitedAt;

    @Column(name = "invite_expires_at", nullable = false)
    private Instant inviteExpiresAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "deactivated_at")
    private Instant deactivatedAt;

    protected PartnerUser() {
    }

    public PartnerUser(UUID id, UUID partnerId, String email, String firstName, String lastName, Role role,
                       Instant invitedAt, Instant inviteExpiresAt) {
        this.id = id;
        this.partnerId = partnerId;
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName;
        this.role = role;
        this.status = Status.INVITED;
        this.invitedAt = invitedAt;
        this.inviteExpiresAt = inviteExpiresAt;
    }

    public boolean isCertified(LocalDate today) {
        return certifiedUntil != null && !certifiedUntil.isBefore(today);
    }

    public boolean holdsSeat() {
        return status != Status.DEACTIVATED;
    }

    public void activate(String subject, Instant at) {
        this.status = Status.ACTIVE;
        this.idpSubject = subject;
        this.lastLoginAt = at;
    }

    public void deactivate(Instant at) {
        this.status = Status.DEACTIVATED;
        this.deactivatedAt = at;
    }

    public void reinvite(Instant at, Instant expiresAt) {
        this.status = Status.INVITED;
        this.invitedAt = at;
        this.inviteExpiresAt = expiresAt;
        this.deactivatedAt = null;
    }

    public String fullName() {
        return firstName + " " + lastName;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public String getEmail() {
        return email;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public Status getStatus() {
        return status;
    }

    public String getIdpSubject() {
        return idpSubject;
    }

    public LocalDate getCertifiedUntil() {
        return certifiedUntil;
    }

    public void setCertifiedUntil(LocalDate certifiedUntil) {
        this.certifiedUntil = certifiedUntil;
    }

    public Instant getInvitedAt() {
        return invitedAt;
    }

    public Instant getInviteExpiresAt() {
        return inviteExpiresAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public Instant getDeactivatedAt() {
        return deactivatedAt;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserController.java`.

```java
package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.users.dto.UserDtos.CertificationRequest;
import com.uniti.partnerportal.users.dto.UserDtos.InviteUserRequest;
import com.uniti.partnerportal.users.dto.UserDtos.PartnerUserResponse;
import com.uniti.partnerportal.users.dto.UserDtos.SeatUsage;
import com.uniti.partnerportal.users.dto.UserDtos.UpdateUserRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
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

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/partners/{partnerId}/users")
@Tag(name = "Partner users", description = "Portal seats, roles and agent certification")
public class PartnerUserController {

    private final PartnerUserService service;
    private final CurrentUserProvider currentUser;

    public PartnerUserController(PartnerUserService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "List users of a partner")
    public PageResponse<PartnerUserResponse> list(@PathVariable UUID partnerId,
                                                  @RequestParam(required = false) PartnerUser.Status status,
                                                  @RequestParam(required = false) PartnerUser.Role role,
                                                  @RequestParam(required = false) Integer page,
                                                  @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by("lastName", "firstName"));
        return PageResponse.from(service.list(partnerId, status, role, pageable, currentUser.get()),
                service::toResponse);
    }

    @GetMapping("/seats")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Seat usage against the tier limit")
    public SeatUsage seats(@PathVariable UUID partnerId) {
        return service.seatUsage(partnerId, currentUser.get());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Invite a user", description = "Consumes a seat; fails when the tier seat limit is reached")
    public PartnerUserResponse invite(@PathVariable UUID partnerId, @Valid @RequestBody InviteUserRequest request) {
        return service.toResponse(service.invite(partnerId, request, currentUser.get()));
    }

    @PostMapping("/accept-invitation")
    @Operation(summary = "Bind the signed-in identity to a pending invitation")
    public PartnerUserResponse acceptInvitation(@PathVariable UUID partnerId) {
        return service.toResponse(service.acceptInvitation(partnerId, currentUser.get()));
    }

    @PutMapping("/{userId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Update a user's name or role")
    public PartnerUserResponse update(@PathVariable UUID partnerId, @PathVariable UUID userId,
                                      @Valid @RequestBody UpdateUserRequest request) {
        return service.toResponse(service.update(partnerId, userId, request, currentUser.get()));
    }

    @PostMapping("/{userId}/resend-invite")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Resend a pending invitation")
    public PartnerUserResponse resend(@PathVariable UUID partnerId, @PathVariable UUID userId) {
        return service.toResponse(service.resendInvite(partnerId, userId, currentUser.get()));
    }

    @PostMapping("/{userId}/deactivate")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Deactivate a user and release their seat")
    public PartnerUserResponse deactivate(@PathVariable UUID partnerId, @PathVariable UUID userId) {
        return service.toResponse(service.deactivate(partnerId, userId, currentUser.get()));
    }

    @PutMapping("/{userId}/certification")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record product certification for an agent")
    public PartnerUserResponse certify(@PathVariable UUID partnerId, @PathVariable UUID userId,
                                       @Valid @RequestBody CertificationRequest request) {
        return service.toResponse(service.recordCertification(partnerId, userId, request.certifiedUntil()));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserRepository.java`.

```java
package com.uniti.partnerportal.users;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface PartnerUserRepository extends JpaRepository<PartnerUser, UUID> {

    Optional<PartnerUser> findByPartnerIdAndEmailIgnoreCase(UUID partnerId, String email);

    Optional<PartnerUser> findByIdAndPartnerId(UUID id, UUID partnerId);

    Optional<PartnerUser> findByIdpSubject(String idpSubject);

    long countByPartnerIdAndStatusIn(UUID partnerId, Collection<PartnerUser.Status> statuses);

    long countByPartnerIdAndRoleAndStatus(UUID partnerId, PartnerUser.Role role, PartnerUser.Status status);

    @Query("""
            SELECT COUNT(u) FROM PartnerUser u
            WHERE u.partnerId = :partnerId
              AND u.status = com.uniti.partnerportal.users.PartnerUser.Status.ACTIVE
              AND u.certifiedUntil >= :today
            """)
    int countCertifiedActive(@Param("partnerId") UUID partnerId, @Param("today") LocalDate today);

    @Query("""
            SELECT u FROM PartnerUser u
            WHERE u.partnerId = :partnerId
              AND (:status IS NULL OR u.status = :status)
              AND (:role IS NULL OR u.role = :role)
            """)
    Page<PartnerUser> search(@Param("partnerId") UUID partnerId,
                             @Param("status") PartnerUser.Status status,
                             @Param("role") PartnerUser.Role role,
                             Pageable pageable);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/users/PartnerUserService.java`.

```java
package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.users.dto.UserDtos.InviteUserRequest;
import com.uniti.partnerportal.users.dto.UserDtos.PartnerUserResponse;
import com.uniti.partnerportal.users.dto.UserDtos.SeatUsage;
import com.uniti.partnerportal.users.dto.UserDtos.UpdateUserRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Locale;
import java.util.UUID;

/**
 * Manages the partner's portal seats. Enforces the tier seat limit, keeps at least one active
 * administrator per partner and prevents users from locking themselves out.
 */
@Service
@Transactional
public class PartnerUserService {

    static final Duration INVITE_TTL = Duration.ofDays(7);
    private static final EnumSet<PartnerUser.Status> SEAT_HOLDING =
            EnumSet.of(PartnerUser.Status.INVITED, PartnerUser.Status.ACTIVE);

    private final PartnerUserRepository users;
    private final PartnerService partners;
    private final Clock clock;

    public PartnerUserService(PartnerUserRepository users, PartnerService partners, Clock clock) {
        this.users = users;
        this.partners = partners;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<PartnerUser> list(UUID partnerId, PartnerUser.Status status, PartnerUser.Role role,
                                  Pageable pageable, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        return users.search(partnerId, status, role, pageable);
    }

    @Transactional(readOnly = true)
    public SeatUsage seatUsage(UUID partnerId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        Partner partner = partners.load(partnerId);
        long used = users.countByPartnerIdAndStatusIn(partnerId, SEAT_HOLDING);
        int limit = partner.getTier().seatLimit();
        return new SeatUsage(limit, used, Math.max(0, limit - used));
    }

    public PartnerUser invite(UUID partnerId, InviteUserRequest request, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        Partner partner = partners.load(partnerId);
        if (partner.getStatus() == PartnerStatus.TERMINATED || partner.getStatus() == PartnerStatus.REJECTED) {
            throw new PortalException.BusinessRule("partner.closed", "Users cannot be added to a closed partner");
        }
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Instant now = Instant.now(clock);
        PartnerUser existing = users.findByPartnerIdAndEmailIgnoreCase(partnerId, email).orElse(null);
        if (existing != null && existing.holdsSeat()) {
            throw new PortalException.Conflict("user.duplicate_email", email + " already has access to this partner");
        }
        assertSeatAvailable(partner);
        if (existing != null) {
            existing.setRole(request.role());
            existing.setFirstName(request.firstName().trim());
            existing.setLastName(request.lastName().trim());
            existing.reinvite(now, now.plus(INVITE_TTL));
            return existing;
        }
        PartnerUser user = new PartnerUser(UUID.randomUUID(), partnerId, email, request.firstName().trim(),
                request.lastName().trim(), request.role(), now, now.plus(INVITE_TTL));
        return users.save(user);
    }

    public PartnerUser resendInvite(UUID partnerId, UUID userId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() != PartnerUser.Status.INVITED) {
            throw new PortalException.BusinessRule("user.not_invited", "Only pending invitations can be resent");
        }
        Instant now = Instant.now(clock);
        user.reinvite(now, now.plus(INVITE_TTL));
        return user;
    }

    /**
     * Called on first sign-in: binds the IdP subject to the invitation if it is still valid.
     */
    public PartnerUser acceptInvitation(UUID partnerId, CurrentUser caller) {
        PartnerUser user = users.findByPartnerIdAndEmailIgnoreCase(partnerId, caller.email())
                .orElseThrow(() -> new PortalException.NotFound("Invitation", caller.email()));
        Instant now = Instant.now(clock);
        if (user.getStatus() == PartnerUser.Status.ACTIVE) {
            user.setLastLoginAt(now);
            return user;
        }
        if (user.getStatus() != PartnerUser.Status.INVITED) {
            throw new PortalException.Forbidden("This account has been deactivated");
        }
        if (user.getInviteExpiresAt().isBefore(now)) {
            throw new PortalException.BusinessRule("user.invite_expired",
                    "The invitation has expired; ask your administrator to resend it");
        }
        user.activate(caller.subject(), now);
        return user;
    }

    public PartnerUser update(UUID partnerId, UUID userId, UpdateUserRequest request, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getRole() == PartnerUser.Role.PARTNER_ADMIN && request.role() != PartnerUser.Role.PARTNER_ADMIN) {
            if (caller.subject().equals(user.getIdpSubject())) {
                throw new PortalException.BusinessRule("user.self_demotion", "You cannot remove your own admin role");
            }
            assertNotLastAdmin(user);
        }
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setRole(request.role());
        return user;
    }

    public PartnerUser deactivate(UUID partnerId, UUID userId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() == PartnerUser.Status.DEACTIVATED) {
            return user;
        }
        if (caller.subject().equals(user.getIdpSubject())) {
            throw new PortalException.BusinessRule("user.self_deactivation", "You cannot deactivate yourself");
        }
        if (user.getRole() == PartnerUser.Role.PARTNER_ADMIN) {
            assertNotLastAdmin(user);
        }
        user.deactivate(Instant.now(clock));
        return user;
    }

    public PartnerUser recordCertification(UUID partnerId, UUID userId, LocalDate certifiedUntil) {
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() == PartnerUser.Status.DEACTIVATED) {
            throw new PortalException.BusinessRule("user.deactivated", "Cannot certify a deactivated user");
        }
        user.setCertifiedUntil(certifiedUntil);
        return user;
    }

    @Transactional(readOnly = true)
    public int certifiedAgentCount(UUID partnerId) {
        return users.countCertifiedActive(partnerId, LocalDate.now(clock));
    }

    public PartnerUserResponse toResponse(PartnerUser u) {
        return new PartnerUserResponse(u.getId(), u.getPartnerId(), u.getEmail(), u.getFirstName(),
                u.getLastName(), u.getRole(), u.getStatus(), u.isCertified(LocalDate.now(clock)),
                u.getCertifiedUntil(), u.getInvitedAt(), u.getInviteExpiresAt(), u.getLastLoginAt());
    }

    private void assertSeatAvailable(Partner partner) {
        long used = users.countByPartnerIdAndStatusIn(partner.getId(), SEAT_HOLDING);
        if (used >= partner.getTier().seatLimit()) {
            throw new PortalException.BusinessRule("user.seat_limit",
                    "The " + partner.getTier() + " tier allows " + partner.getTier().seatLimit()
                            + " users; deactivate a user or progress to a higher tier");
        }
    }

    private void assertNotLastAdmin(PartnerUser user) {
        long activeAdmins = users.countByPartnerIdAndRoleAndStatus(user.getPartnerId(),
                PartnerUser.Role.PARTNER_ADMIN, PartnerUser.Status.ACTIVE);
        boolean userIsActiveAdmin = user.getStatus() == PartnerUser.Status.ACTIVE;
        if (userIsActiveAdmin && activeAdmins <= 1) {
            throw new PortalException.BusinessRule("user.last_admin",
                    "A partner must keep at least one active administrator");
        }
    }

    private PartnerUser load(UUID partnerId, UUID userId) {
        return users.findByIdAndPartnerId(userId, partnerId)
                .orElseThrow(() -> new PortalException.NotFound("PartnerUser", userId));
    }
}
```

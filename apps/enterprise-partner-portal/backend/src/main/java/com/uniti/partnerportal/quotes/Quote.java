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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
        Set<String> approvers = new HashSet<>();
        for (QuoteApproval a : approvals) {
            if (a.getRevision() == revision && a.getDecision() == QuoteApproval.Decision.APPROVED) {
                approvers.add(a.getApprover());
            }
        }
        return approvers.size();
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

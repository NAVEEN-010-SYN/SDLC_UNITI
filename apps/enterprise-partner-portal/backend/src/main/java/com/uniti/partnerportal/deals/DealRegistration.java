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

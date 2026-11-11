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

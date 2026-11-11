package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.common.domain.StateMachine;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "partner_lead")
public class Lead extends AuditableEntity {

    public enum Status { NEW, CONTACTED, QUALIFIED, CONVERTED, DISQUALIFIED }

    public enum Source { REFERRAL, EVENT, WEBSITE, OUTBOUND, UNITI_SHARED, OTHER }

    public static final StateMachine<Status> LIFECYCLE = StateMachine.builder("Lead", Status.class)
            .allow(Status.NEW, Status.CONTACTED, Status.QUALIFIED, Status.DISQUALIFIED)
            .allow(Status.CONTACTED, Status.QUALIFIED, Status.DISQUALIFIED)
            .allow(Status.QUALIFIED, Status.CONVERTED, Status.DISQUALIFIED)
            .allow(Status.DISQUALIFIED, Status.NEW)
            .build();

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "owner_subject", nullable = false, length = 120)
    private String ownerSubject;

    @Column(name = "company_name", nullable = false, length = 200)
    private String companyName;

    @Column(name = "contact_name", nullable = false, length = 120)
    private String contactName;

    @Column(name = "contact_email", nullable = false, length = 200)
    private String contactEmail;

    @Column(name = "contact_phone", length = 30)
    private String contactPhone;

    @Column(nullable = false, length = 10)
    private String postcode;

    @Column(name = "site_count", nullable = false)
    private int siteCount;

    @Column(name = "estimated_mrc_minor", nullable = false)
    private long estimatedMrcMinor;

    @Column(name = "product_interest", length = 200)
    private String productInterest;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Source source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(nullable = false)
    private int score;

    @Column(length = 2000)
    private String notes;

    @Column(name = "next_action_at")
    private Instant nextActionAt;

    @Column(name = "disqualify_reason", length = 300)
    private String disqualifyReason;

    @Column(name = "converted_deal_id")
    private UUID convertedDealId;

    protected Lead() {
    }

    public Lead(UUID id, String reference, UUID partnerId, String ownerSubject) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.ownerSubject = ownerSubject;
        this.status = Status.NEW;
    }

    public void transitionTo(Status next) {
        LIFECYCLE.assertTransition(status, next);
        this.status = next;
        if (next != Status.DISQUALIFIED) {
            this.disqualifyReason = null;
        }
    }

    public void disqualify(String reason) {
        transitionTo(Status.DISQUALIFIED);
        this.disqualifyReason = reason;
    }

    public void markConverted(UUID dealId) {
        transitionTo(Status.CONVERTED);
        this.convertedDealId = dealId;
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

    public String getOwnerSubject() {
        return ownerSubject;
    }

    public void setOwnerSubject(String ownerSubject) {
        this.ownerSubject = ownerSubject;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
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

    public String getPostcode() {
        return postcode;
    }

    public void setPostcode(String postcode) {
        this.postcode = postcode;
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

    public String getProductInterest() {
        return productInterest;
    }

    public void setProductInterest(String productInterest) {
        this.productInterest = productInterest;
    }

    public Source getSource() {
        return source;
    }

    public void setSource(Source source) {
        this.source = source;
    }

    public Status getStatus() {
        return status;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Instant getNextActionAt() {
        return nextActionAt;
    }

    public void setNextActionAt(Instant nextActionAt) {
        this.nextActionAt = nextActionAt;
    }

    public String getDisqualifyReason() {
        return disqualifyReason;
    }

    public UUID getConvertedDealId() {
        return convertedDealId;
    }
}

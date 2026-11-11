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

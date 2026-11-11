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

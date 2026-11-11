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

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

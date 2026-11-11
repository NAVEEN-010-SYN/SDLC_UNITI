package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.common.domain.StateMachine;
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
 * A bank payment for an approved statement. Failed payments (e.g. rejected bank details) can be
 * rescheduled once the partner has corrected them.
 */
@Entity
@Table(name = "commission_payout")
public class CommissionPayout extends AuditableEntity {

    public enum Status { SCHEDULED, PAID, FAILED }

    static final StateMachine<Status> LIFECYCLE = StateMachine.builder("Commission payout", Status.class)
            .allow(Status.SCHEDULED, Status.PAID, Status.FAILED)
            .allow(Status.FAILED, Status.SCHEDULED)
            .build();

    @Id
    private UUID id;

    @Column(name = "statement_id", nullable = false, unique = true)
    private UUID statementId;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "scheduled_for", nullable = false)
    private LocalDate scheduledFor;

    @Column(name = "payment_reference", length = 40)
    private String paymentReference;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    protected CommissionPayout() {
    }

    public CommissionPayout(UUID id, UUID statementId, UUID partnerId, long amountMinor, String currency,
                            LocalDate scheduledFor) {
        if (amountMinor <= 0) {
            throw new IllegalArgumentException("Payout amount must be positive");
        }
        this.id = id;
        this.statementId = statementId;
        this.partnerId = partnerId;
        this.amountMinor = amountMinor;
        this.currency = currency;
        this.scheduledFor = scheduledFor;
        this.status = Status.SCHEDULED;
    }

    public void markPaid(String paymentReference, Instant at) {
        LIFECYCLE.assertTransition(status, Status.PAID);
        this.status = Status.PAID;
        this.paymentReference = paymentReference;
        this.paidAt = at;
        this.failureReason = null;
    }

    public void markFailed(String reason) {
        LIFECYCLE.assertTransition(status, Status.FAILED);
        this.status = Status.FAILED;
        this.failureReason = reason;
    }

    public void reschedule(LocalDate date) {
        LIFECYCLE.assertTransition(status, Status.SCHEDULED);
        this.status = Status.SCHEDULED;
        this.scheduledFor = date;
    }

    public UUID getId() {
        return id;
    }

    public UUID getStatementId() {
        return statementId;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public Status getStatus() {
        return status;
    }

    public LocalDate getScheduledFor() {
        return scheduledFor;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public String getFailureReason() {
        return failureReason;
    }
}

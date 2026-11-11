package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.UUID;

/**
 * Monthly commission statement for one partner: every ledger entry earned up to the period end
 * that was not on an earlier statement, plus any balance brought forward from a statement that
 * was too small (or negative) to pay.
 */
@Entity
@Table(name = "commission_statement")
public class CommissionStatement extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatementStatus status;

    @Column(name = "accrued_minor", nullable = false)
    private long accruedMinor;

    @Column(name = "clawback_minor", nullable = false)
    private long clawbackMinor;

    @Column(name = "adjustment_minor", nullable = false)
    private long adjustmentMinor;

    @Column(name = "brought_forward_minor", nullable = false)
    private long broughtForwardMinor;

    @Column(name = "net_payable_minor", nullable = false)
    private long netPayableMinor;

    @Column(name = "issued_at")
    private Instant issuedAt;

    @Column(name = "dispute_reason", length = 1000)
    private String disputeReason;

    @Column(name = "disputed_at")
    private Instant disputedAt;

    @Column(name = "decided_by", length = 120)
    private String decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "carried_into_statement_id")
    private UUID carriedIntoStatementId;

    protected CommissionStatement() {
    }

    public CommissionStatement(UUID id, String reference, UUID partnerId, LocalDate periodStart, LocalDate periodEnd,
                               String currency) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.currency = currency;
        this.status = StatementStatus.DRAFT;
    }

    /**
     * Recomputes the totals from the entries on the statement. Called whenever the entry set
     * changes so the figures can never disagree with the ledger.
     */
    public void recalculate(Collection<CommissionEntry> entries, long broughtForward) {
        long accrued = 0;
        long clawback = 0;
        long adjustment = 0;
        for (CommissionEntry e : entries) {
            if (!e.getCurrency().equals(currency)) {
                throw new IllegalArgumentException("Entry " + e.getId() + " is not in " + currency);
            }
            switch (e.getType()) {
                case ACCRUAL -> accrued = Math.addExact(accrued, e.getAmountMinor());
                case CLAWBACK -> clawback = Math.addExact(clawback, e.getAmountMinor());
                case ADJUSTMENT -> adjustment = Math.addExact(adjustment, e.getAmountMinor());
            }
        }
        this.accruedMinor = accrued;
        this.clawbackMinor = clawback;
        this.adjustmentMinor = adjustment;
        this.broughtForwardMinor = broughtForward;
        this.netPayableMinor = Math.addExact(Math.addExact(Math.addExact(accrued, clawback), adjustment),
                broughtForward);
    }

    public void transitionTo(StatementStatus next) {
        StatementStatus.LIFECYCLE.assertTransition(status, next);
        this.status = next;
    }

    public void issue(Instant at) {
        transitionTo(StatementStatus.ISSUED);
        this.issuedAt = at;
    }

    public void dispute(String reason, Instant at) {
        transitionTo(StatementStatus.DISPUTED);
        this.disputeReason = reason;
        this.disputedAt = at;
    }

    public void decide(StatementStatus outcome, String by, Instant at) {
        transitionTo(outcome);
        this.decidedBy = by;
        this.decidedAt = at;
    }

    public void markPaid(Instant at) {
        transitionTo(StatementStatus.PAID);
        this.paidAt = at;
    }

    public void carryInto(UUID statementId) {
        if (status != StatementStatus.CARRIED_FORWARD || carriedIntoStatementId != null) {
            throw new IllegalStateException("Statement " + reference + " has no balance to carry forward");
        }
        this.carriedIntoStatementId = statementId;
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

    public LocalDate getPeriodStart() {
        return periodStart;
    }

    public LocalDate getPeriodEnd() {
        return periodEnd;
    }

    public String getCurrency() {
        return currency;
    }

    public StatementStatus getStatus() {
        return status;
    }

    public long getAccruedMinor() {
        return accruedMinor;
    }

    public long getClawbackMinor() {
        return clawbackMinor;
    }

    public long getAdjustmentMinor() {
        return adjustmentMinor;
    }

    public long getBroughtForwardMinor() {
        return broughtForwardMinor;
    }

    public long getNetPayableMinor() {
        return netPayableMinor;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public String getDisputeReason() {
        return disputeReason;
    }

    public Instant getDisputedAt() {
        return disputedAt;
    }

    public String getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public UUID getCarriedIntoStatementId() {
        return carriedIntoStatementId;
    }
}

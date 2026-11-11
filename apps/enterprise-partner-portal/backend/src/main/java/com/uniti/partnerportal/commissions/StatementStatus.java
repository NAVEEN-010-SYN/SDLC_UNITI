package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * <pre>
 * DRAFT -> ISSUED -> APPROVED -> PAID
 *           | ^  \
 *           v |   +-> CARRIED_FORWARD (net below the payout minimum, or negative)
 *         DISPUTED
 * </pre>
 * A carried-forward statement's balance is brought into the partner's next statement.
 */
public enum StatementStatus {
    DRAFT,
    ISSUED,
    DISPUTED,
    APPROVED,
    CARRIED_FORWARD,
    PAID;

    public static final StateMachine<StatementStatus> LIFECYCLE = StateMachine
            .builder("Commission statement", StatementStatus.class)
            .allow(DRAFT, ISSUED)
            .allow(ISSUED, DISPUTED, APPROVED, CARRIED_FORWARD)
            .allow(DISPUTED, ISSUED)
            .allow(APPROVED, PAID)
            .build();

    public boolean acceptsAdjustments() {
        return this == DRAFT || this == DISPUTED;
    }
}

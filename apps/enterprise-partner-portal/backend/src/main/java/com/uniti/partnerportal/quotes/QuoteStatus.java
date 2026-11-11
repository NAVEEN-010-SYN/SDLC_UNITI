package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * <pre>
 * DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT -> ACCEPTED -> ORDERED
 *   ^            |                |         |-> DECLINED
 *   +--- REJECTED <               +-> EXPIRED (validity lapsed)
 * </pre>
 * A quote can be revised back to DRAFT until it is accepted, which voids any approval.
 */
public enum QuoteStatus {
    DRAFT,
    PENDING_APPROVAL,
    APPROVED,
    REJECTED,
    SENT,
    ACCEPTED,
    DECLINED,
    EXPIRED,
    ORDERED;

    public static final StateMachine<QuoteStatus> LIFECYCLE = StateMachine
            .builder("Quote", QuoteStatus.class)
            .allow(DRAFT, PENDING_APPROVAL, APPROVED)
            .allow(PENDING_APPROVAL, APPROVED, REJECTED, DRAFT)
            .allow(REJECTED, DRAFT)
            .allow(APPROVED, SENT, DRAFT, EXPIRED)
            .allow(SENT, ACCEPTED, DECLINED, EXPIRED, DRAFT)
            .allow(ACCEPTED, ORDERED)
            .allow(EXPIRED, DRAFT)
            .build();

    public boolean isEditable() {
        return this == DRAFT;
    }
}

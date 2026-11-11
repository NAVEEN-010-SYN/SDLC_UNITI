package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.domain.StateMachine;

import java.util.EnumSet;
import java.util.Set;

public enum DealStatus {
    SUBMITTED,
    UNDER_REVIEW,
    APPROVED,
    REJECTED,
    WON,
    LOST,
    EXPIRED,
    WITHDRAWN;

    public static final StateMachine<DealStatus> LIFECYCLE = StateMachine
            .builder("Deal registration", DealStatus.class)
            .allow(SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN)
            .allow(UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN)
            .allow(APPROVED, WON, LOST, EXPIRED, WITHDRAWN)
            .build();

    /** Registrations that still claim the customer and therefore participate in conflict checks. */
    public static final Set<DealStatus> CLAIMING = EnumSet.of(SUBMITTED, UNDER_REVIEW, APPROVED);

    public boolean isOpen() {
        return CLAIMING.contains(this);
    }
}

package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.domain.StateMachine;

/**
 * Partner onboarding and lifecycle.
 * <pre>
 * APPLIED -> KYC_PENDING -> KYC_UNDER_REVIEW -> ACTIVE <-> SUSPENDED -> TERMINATED
 *                   ^              |
 *                   +-- (rework) --+--> REJECTED
 * </pre>
 */
public enum PartnerStatus {
    APPLIED,
    KYC_PENDING,
    KYC_UNDER_REVIEW,
    ACTIVE,
    SUSPENDED,
    REJECTED,
    TERMINATED;

    public static final StateMachine<PartnerStatus> LIFECYCLE = StateMachine
            .builder("Partner", PartnerStatus.class)
            .allow(APPLIED, KYC_PENDING, REJECTED)
            .allow(KYC_PENDING, KYC_UNDER_REVIEW, REJECTED)
            .allow(KYC_UNDER_REVIEW, ACTIVE, KYC_PENDING, REJECTED)
            .allow(ACTIVE, SUSPENDED, TERMINATED)
            .allow(SUSPENDED, ACTIVE, TERMINATED)
            .build();

    public boolean canTransact() {
        return this == ACTIVE;
    }
}

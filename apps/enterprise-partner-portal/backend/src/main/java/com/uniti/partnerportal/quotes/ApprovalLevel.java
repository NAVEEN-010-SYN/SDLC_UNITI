package com.uniti.partnerportal.quotes;

/**
 * Who must sign off a quote's discount.
 * <ul>
 *   <li>{@code NONE}: within the partner's self-approved allowance.</li>
 *   <li>{@code CHANNEL_MANAGER}: one Uniti channel manager approval.</li>
 *   <li>{@code DEAL_DESK}: two approvals from distinct channel managers.</li>
 * </ul>
 */
public enum ApprovalLevel {
    NONE(0),
    CHANNEL_MANAGER(1),
    DEAL_DESK(2);

    private final int approvalsRequired;

    ApprovalLevel(int approvalsRequired) {
        this.approvalsRequired = approvalsRequired;
    }

    public int approvalsRequired() {
        return approvalsRequired;
    }
}

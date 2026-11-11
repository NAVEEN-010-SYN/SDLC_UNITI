package com.uniti.partnerportal.orders;

/**
 * Per-site fulfilment progress as reported by the provisioning platform. Stages normally move
 * forward in declaration order; {@code BLOCKED} can be entered from any non-terminal stage and
 * left back to the stage the site was blocked at or later.
 */
public enum ProvisioningStage {
    AWAITING_SURVEY,
    SURVEY_COMPLETE,
    BUILD_SCHEDULED,
    ENGINEER_BOOKED,
    INSTALLED,
    LIVE,
    BLOCKED;

    public boolean isTerminal() {
        return this == LIVE;
    }

    /**
     * Whether a site may move from this stage to {@code next}. Progress may skip stages (e.g. a
     * site on existing fibre needs no build) but never goes backwards.
     */
    public boolean canMoveTo(ProvisioningStage next, ProvisioningStage resumeFloor) {
        if (this == LIVE || next == this) {
            return false;
        }
        if (next == BLOCKED) {
            return true;
        }
        if (this == BLOCKED) {
            return resumeFloor == null || next.ordinal() >= resumeFloor.ordinal();
        }
        return next.ordinal() > ordinal();
    }
}

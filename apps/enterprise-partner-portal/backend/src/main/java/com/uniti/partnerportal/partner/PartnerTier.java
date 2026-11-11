package com.uniti.partnerportal.partner;

import java.math.BigDecimal;

/**
 * Programme tiers and the commercial levers attached to each. Thresholds are on trailing
 * twelve-month booked recurring revenue (minor units) plus the number of certified agents, and a
 * partner must meet both to qualify.
 */
public enum PartnerTier {

    REGISTERED(0L, 0, 800, new BigDecimal("5"), 0, 5),
    SILVER(5_000_000L, 2, 1000, new BigDecimal("10"), 100, 15),
    GOLD(25_000_000L, 5, 1250, new BigDecimal("15"), 200, 40),
    PLATINUM(100_000_000L, 10, 1500, new BigDecimal("20"), 300, 150);

    private final long revenueThresholdMinor;
    private final int certifiedAgentsRequired;
    private final int commissionRateBps;
    private final BigDecimal selfApprovedDiscountPercent;
    private final int mdfAccrualBps;
    private final int seatLimit;

    PartnerTier(long revenueThresholdMinor, int certifiedAgentsRequired, int commissionRateBps,
                BigDecimal selfApprovedDiscountPercent, int mdfAccrualBps, int seatLimit) {
        this.revenueThresholdMinor = revenueThresholdMinor;
        this.certifiedAgentsRequired = certifiedAgentsRequired;
        this.commissionRateBps = commissionRateBps;
        this.selfApprovedDiscountPercent = selfApprovedDiscountPercent;
        this.mdfAccrualBps = mdfAccrualBps;
        this.seatLimit = seatLimit;
    }

    public long revenueThresholdMinor() {
        return revenueThresholdMinor;
    }

    public int certifiedAgentsRequired() {
        return certifiedAgentsRequired;
    }

    /** Upfront commission rate applied to first-year recurring revenue, in basis points. */
    public int commissionRateBps() {
        return commissionRateBps;
    }

    /** Discount a partner may give on a quote without Uniti approval. */
    public BigDecimal selfApprovedDiscountPercent() {
        return selfApprovedDiscountPercent;
    }

    /** Share of quarterly booked revenue that accrues into the partner's MDF balance. */
    public int mdfAccrualBps() {
        return mdfAccrualBps;
    }

    /** Maximum number of active portal users. */
    public int seatLimit() {
        return seatLimit;
    }

    public boolean qualifies(long trailingRevenueMinor, int certifiedAgents) {
        return trailingRevenueMinor >= revenueThresholdMinor && certifiedAgents >= certifiedAgentsRequired;
    }

    public PartnerTier oneBelow() {
        return ordinal() == 0 ? this : values()[ordinal() - 1];
    }

    /**
     * Highest tier whose thresholds are met.
     */
    public static PartnerTier highestQualifying(long trailingRevenueMinor, int certifiedAgents) {
        PartnerTier result = REGISTERED;
        for (PartnerTier tier : values()) {
            if (tier.qualifies(trailingRevenueMinor, certifiedAgents)) {
                result = tier;
            }
        }
        return result;
    }
}

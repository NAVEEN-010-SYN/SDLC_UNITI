package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierEvaluationResponse;
import com.uniti.partnerportal.users.PartnerUserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Re-computes a partner's programme tier from trailing twelve-month bookings and certified
 * headcount.
 * <ul>
 *   <li>Upgrades take effect immediately, to the highest tier the partner qualifies for.</li>
 *   <li>Downgrades are softened: a partner keeps its tier for a grace period after the last
 *       change, and then drops at most one tier per evaluation.</li>
 * </ul>
 */
@Service
public class TierEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(TierEvaluationService.class);
    static final Duration DOWNGRADE_GRACE = Duration.ofDays(90);

    private final PartnerRepository partners;
    private final PartnerOrderRepository orders;
    private final PartnerUserService users;
    private final Clock clock;

    public TierEvaluationService(PartnerRepository partners, PartnerOrderRepository orders,
                                 PartnerUserService users, Clock clock) {
        this.partners = partners;
        this.orders = orders;
        this.users = users;
        this.clock = clock;
    }

    @Transactional
    public TierEvaluationResponse evaluate(UUID partnerId) {
        Partner partner = partners.findById(partnerId)
                .orElseThrow(() -> new com.uniti.partnerportal.common.error.PortalException.NotFound("Partner", partnerId));
        Instant now = Instant.now(clock);
        Instant since = now.minus(365, ChronoUnit.DAYS);
        long monthly = orders.sumActivatedMonthlyRecurring(partnerId, since);
        long trailing = Math.multiplyExact(monthly, 12L);
        int certified = users.certifiedAgentCount(partnerId);

        Decision decision = decide(partner.getTier(), partner.getTierEvaluatedAt(), trailing, certified, now);
        partner.setTrailingRevenueMinor(trailing);
        if (decision.tier() != partner.getTier()) {
            log.info("partner_tier_changed partnerId={} from={} to={}", partnerId, partner.getTier(), decision.tier());
            partner.setTier(decision.tier(), now);
        }
        return new TierEvaluationResponse(decision.previous(), decision.tier(), trailing, certified,
                decision.previous() != decision.tier(), decision.note());
    }

    /**
     * Pure tier decision, separated for unit testing.
     */
    static Decision decide(PartnerTier current, Instant lastChange, long trailingRevenue, int certifiedAgents,
                           Instant now) {
        PartnerTier qualifying = PartnerTier.highestQualifying(trailingRevenue, certifiedAgents);
        if (qualifying.compareTo(current) > 0) {
            return new Decision(current, qualifying, "Upgraded: thresholds for " + qualifying + " met");
        }
        if (qualifying == current) {
            return new Decision(current, current, "Tier confirmed");
        }
        if (lastChange != null && lastChange.plus(DOWNGRADE_GRACE).isAfter(now)) {
            return new Decision(current, current,
                    "Below " + current + " thresholds; within grace period until " + lastChange.plus(DOWNGRADE_GRACE));
        }
        PartnerTier next = current.oneBelow();
        return new Decision(current, next, "Downgraded one tier; qualifies for " + qualifying);
    }

    /**
     * Quarterly sweep across all active partners (01:30 UTC on the first day of each quarter).
     */
    @Scheduled(cron = "0 30 1 1 1,4,7,10 *", zone = "UTC")
    public void evaluateAllActive() {
        for (Partner partner : partners.findByStatus(PartnerStatus.ACTIVE)) {
            try {
                evaluate(partner.getId());
            } catch (RuntimeException ex) {
                log.error("tier_evaluation_failed partnerId={}", partner.getId(), ex);
            }
        }
    }

    record Decision(PartnerTier previous, PartnerTier tier, String note) {
    }
}

package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.money.Money;
import com.uniti.partnerportal.partner.PartnerTier;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Prices a quote and decides the approval it needs. Pure and deterministic so every rule can be
 * unit tested without a database.
 *
 * <h2>Discount stack (applied to monthly recurring charges in this order)</h2>
 * <ol>
 *   <li><b>Term discount</b>: 24 months 5%, 36 months 10%, 60 months 15%.</li>
 *   <li><b>Volume discount</b> on distinct sites: 5+ 3%, 10+ 5%, 25+ 8%.</li>
 *   <li><b>Partner discount</b>: whatever additional percentage the partner requests.</li>
 * </ol>
 * Installation (NRC) is waived on terms of 36 months or more.
 *
 * <h2>Approval matrix (on the partner discount only)</h2>
 * <ul>
 *   <li>Up to the tier's self-approved allowance: no approval. Without a protected deal
 *       registration the allowance is halved, which is the main incentive to register.</li>
 *   <li>Up to allowance + 10 points: one channel manager.</li>
 *   <li>Up to the programme maximum: deal desk (two channel managers).</li>
 *   <li>Above the maximum, or any line priced below its floor: not quotable.</li>
 * </ul>
 */
@Component
public class QuotePricingEngine {

    public static final Set<Integer> ALLOWED_TERMS = Set.of(12, 24, 36, 60);
    static final BigDecimal CHANNEL_MANAGER_BAND = BigDecimal.TEN;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private static final Map<Integer, BigDecimal> TERM_DISCOUNT = Map.of(
            12, BigDecimal.ZERO,
            24, new BigDecimal("5"),
            36, new BigDecimal("10"),
            60, new BigDecimal("15"));

    private static final TreeMap<Integer, BigDecimal> VOLUME_DISCOUNT = new TreeMap<>(Map.of(
            1, BigDecimal.ZERO,
            5, new BigDecimal("3"),
            10, new BigDecimal("5"),
            25, new BigDecimal("8")));

    public record PricingInput(List<QuoteLine> lines, int termMonths, BigDecimal requestedDiscountPercent,
                               PartnerTier tier, boolean hasProtectedDeal, BigDecimal maxDiscountPercent,
                               String currency) {
    }

    public record FloorBreach(int lineNo, String sku, Money netMrc, Money floorMrc) {
    }

    public record PricingResult(Money listMrc,
                                Money termDiscount,
                                Money volumeDiscount,
                                Money partnerDiscount,
                                Money netMrc,
                                List<Money> lineNetMrc,
                                Money nrc,
                                boolean nrcWaived,
                                Money totalContractValue,
                                BigDecimal termDiscountPercent,
                                BigDecimal volumeDiscountPercent,
                                BigDecimal effectiveDiscountPercent,
                                BigDecimal selfApprovedAllowancePercent,
                                ApprovalLevel approvalLevel,
                                List<FloorBreach> floorBreaches,
                                List<String> blockers) {

        public boolean isQuotable() {
            return blockers.isEmpty();
        }
    }

    public PricingResult price(PricingInput input) {
        String ccy = input.currency();
        List<String> blockers = new ArrayList<>();
        if (input.lines().isEmpty()) {
            blockers.add("Quote has no lines");
        }
        if (!ALLOWED_TERMS.contains(input.termMonths())) {
            blockers.add("Term must be one of " + ALLOWED_TERMS + " months");
        }
        BigDecimal requested = input.requestedDiscountPercent() == null ? BigDecimal.ZERO
                : input.requestedDiscountPercent();
        if (requested.signum() < 0) {
            blockers.add("Discount cannot be negative");
            requested = BigDecimal.ZERO;
        }

        BigDecimal termPct = TERM_DISCOUNT.getOrDefault(input.termMonths(), BigDecimal.ZERO);
        int sites = distinctSites(input.lines());
        BigDecimal volumePct = VOLUME_DISCOUNT.floorEntry(Math.max(sites, 1)).getValue();

        Money list = Money.zero(ccy);
        Money nrc = Money.zero(ccy);
        List<Money> lineNet = new ArrayList<>();
        List<FloorBreach> breaches = new ArrayList<>();
        Money termDiscount = Money.zero(ccy);
        Money volumeDiscount = Money.zero(ccy);
        Money partnerDiscount = Money.zero(ccy);

        for (QuoteLine line : input.lines()) {
            Money lineList = Money.of(line.listMrcMinor(), ccy);
            Money afterTerm = lineList.discountBy(termPct);
            Money afterVolume = afterTerm.discountBy(volumePct);
            Money net = afterVolume.discountBy(requested);
            termDiscount = termDiscount.plus(lineList.minus(afterTerm));
            volumeDiscount = volumeDiscount.plus(afterTerm.minus(afterVolume));
            partnerDiscount = partnerDiscount.plus(afterVolume.minus(net));
            list = list.plus(lineList);
            nrc = nrc.plus(Money.of(line.nrcMinor(), ccy));
            lineNet.add(net);
            Money floor = Money.of(line.floorMrcMinor(), ccy);
            if (net.isLessThan(floor)) {
                breaches.add(new FloorBreach(line.getLineNo(), line.getSku(), net, floor));
            }
        }

        Money netMrc = list.minus(termDiscount).minus(volumeDiscount).minus(partnerDiscount);
        boolean waived = input.termMonths() >= 36;
        Money chargedNrc = waived ? Money.zero(ccy) : nrc;
        Money tcv = netMrc.times(input.termMonths()).plus(chargedNrc);

        BigDecimal effective = list.isZero() ? BigDecimal.ZERO
                : BigDecimal.valueOf(list.amountMinor() - netMrc.amountMinor())
                .multiply(HUNDRED)
                .divide(BigDecimal.valueOf(list.amountMinor()), 3, RoundingMode.HALF_EVEN);

        BigDecimal allowance = selfApprovedAllowance(input.tier(), input.hasProtectedDeal());
        ApprovalLevel level = approvalLevel(requested, allowance);
        BigDecimal max = input.maxDiscountPercent();
        if (requested.compareTo(max) > 0) {
            blockers.add("Partner discount " + requested.stripTrailingZeros().toPlainString()
                    + "% exceeds the programme maximum of " + max.stripTrailingZeros().toPlainString() + "%");
        }
        if (!breaches.isEmpty()) {
            blockers.add(breaches.size() + " line(s) priced below the floor price");
        }

        return new PricingResult(list, termDiscount, volumeDiscount, partnerDiscount, netMrc, lineNet, chargedNrc,
                waived, tcv, termPct, volumePct, effective, allowance, level, breaches, blockers);
    }

    static BigDecimal selfApprovedAllowance(PartnerTier tier, boolean hasProtectedDeal) {
        BigDecimal base = tier.selfApprovedDiscountPercent();
        return hasProtectedDeal ? base : base.divide(BigDecimal.valueOf(2), 3, RoundingMode.HALF_EVEN);
    }

    static ApprovalLevel approvalLevel(BigDecimal requested, BigDecimal allowance) {
        if (requested.compareTo(allowance) <= 0) {
            return ApprovalLevel.NONE;
        }
        if (requested.compareTo(allowance.add(CHANNEL_MANAGER_BAND)) <= 0) {
            return ApprovalLevel.CHANNEL_MANAGER;
        }
        return ApprovalLevel.DEAL_DESK;
    }

    static int distinctSites(List<QuoteLine> lines) {
        return lines.stream()
                .map(l -> l.getSitePostcode().replaceAll("\\s+", "").toUpperCase() + "|"
                        + l.getSiteName().trim().toLowerCase())
                .collect(Collectors.toSet())
                .size();
    }
}

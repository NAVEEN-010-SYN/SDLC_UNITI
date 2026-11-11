package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.money.Money;
import com.uniti.partnerportal.partner.PartnerTier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Computes the upfront commission earned when an order goes live. Pure and deterministic.
 *
 * <h2>Basis</h2>
 * First-year value (FYV) = net monthly recurring charge x min(term, 12). One-off charges never
 * earn commission.
 *
 * <h2>Components</h2>
 * <ol>
 *   <li><b>BASE</b>: FYV x the partner tier's commission rate.</li>
 *   <li><b>DEAL_REGISTRATION</b>: FYV x the registration uplift when the order came from an
 *       approved deal registration.</li>
 *   <li><b>NEW_LOGO</b>: flat bonus when the order created a new customer account.</li>
 *   <li><b>RULE</b>: each effective incentive rule pays its rate on the FYV of the sites it
 *       covers, plus its flat bonus once per order if at least one site qualifies.</li>
 * </ol>
 */
@Component
public class CommissionCalculator {

    static final int FIRST_YEAR_MONTHS = 12;

    public record SiteBasis(CatalogProduct.Category category, long netMrcMinor) {
    }

    public record OrderBasis(String currency, int termMonths, boolean dealRegistered, boolean newLogo,
                             List<SiteBasis> sites) {
    }

    public record Line(String component, String description, Money amount) {
    }

    public record Result(Money firstYearValue, List<Line> lines, Money total) {
    }

    public Result calculate(OrderBasis order, PartnerTier tier, List<CommissionRule> effectiveRules,
                            PortalProperties.Commissions config) {
        String ccy = order.currency();
        int months = Math.min(order.termMonths(), FIRST_YEAR_MONTHS);
        Money fyv = firstYearValue(order.sites(), ccy, months);

        List<Line> lines = new ArrayList<>();
        add(lines, "BASE", tier + " tier rate " + bpsAsPercent(tier.commissionRateBps()),
                fyv.basisPoints(tier.commissionRateBps()));
        if (order.dealRegistered()) {
            add(lines, "DEAL_REGISTRATION", "Registered deal uplift " + bpsAsPercent(config.dealRegistrationUpliftBps()),
                    fyv.basisPoints(config.dealRegistrationUpliftBps()));
        }
        if (order.newLogo()) {
            add(lines, "NEW_LOGO", "New customer bonus", Money.of(config.newLogoBonusMinor(), ccy));
        }
        for (CommissionRule rule : effectiveRules) {
            if (!rule.getCurrency().equals(ccy) || !rule.eligible(tier, order.termMonths())) {
                continue;
            }
            List<SiteBasis> covered = new ArrayList<>();
            for (SiteBasis s : order.sites()) {
                if (rule.covers(s.category())) {
                    covered.add(s);
                }
            }
            if (covered.isEmpty()) {
                continue;
            }
            Money coveredFyv = firstYearValue(covered, ccy, months);
            Money amount = coveredFyv.basisPoints(rule.getRateBps()).plus(Money.of(rule.getFlatBonusMinor(), ccy));
            add(lines, "RULE", rule.getName(), amount);
        }
        Money total = Money.zero(ccy);
        for (Line line : lines) {
            total = total.plus(line.amount());
        }
        return new Result(fyv, List.copyOf(lines), total);
    }

    private static Money firstYearValue(List<SiteBasis> sites, String ccy, int months) {
        Money sum = Money.zero(ccy);
        for (SiteBasis s : sites) {
            sum = sum.plus(Money.of(s.netMrcMinor(), ccy).times(months));
        }
        return sum;
    }

    private static void add(List<Line> lines, String component, String description, Money amount) {
        if (!amount.isZero()) {
            lines.add(new Line(component, description, amount));
        }
    }

    static String bpsAsPercent(int bps) {
        return (bps / 100) + "." + String.format("%02d", bps % 100) + "%";
    }
}

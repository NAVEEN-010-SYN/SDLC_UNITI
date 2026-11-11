package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct.Category;
import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CommissionCalculatorTest {

    private final CommissionCalculator calculator = new CommissionCalculator();
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);

    private static CommissionRule rule(String name, Category category, PartnerTier minTier, int minTerm, int bps,
                                       long flat, String currency) {
        return new CommissionRule(UUID.randomUUID(), name, category, minTier, minTerm, bps, flat, currency, FROM, null);
    }

    private static CommissionCalculator.OrderBasis order(int term, boolean deal, boolean newLogo) {
        return new CommissionCalculator.OrderBasis("GBP", term, deal, newLogo, List.of(
                new CommissionCalculator.SiteBasis(Category.BROADBAND, 10_000),
                new CommissionCalculator.SiteBasis(Category.SDWAN, 20_000)));
    }

    @Test
    void stacksBaseDealUpliftNewLogoAndMatchingRules() {
        var rules = List.of(
                rule("SD-WAN accelerator", Category.SDWAN, null, 36, 300, 10_000, "GBP"),
                rule("Platinum only", null, PartnerTier.PLATINUM, 0, 500, 0, "GBP"),
                rule("Five-year push", null, null, 60, 500, 0, "GBP"),
                rule("Euro promo", null, null, 0, 500, 0, "EUR"));

        var result = calculator.calculate(order(36, true, true), PartnerTier.GOLD, rules,
                TestFixtures.properties().commissions());

        assertThat(result.firstYearValue().amountMinor()).isEqualTo(360_000);
        assertThat(result.lines()).extracting(CommissionCalculator.Line::component)
                .containsExactly("BASE", "DEAL_REGISTRATION", "NEW_LOGO", "RULE");
        assertThat(result.lines()).extracting(l -> l.amount().amountMinor())
                .containsExactly(45_000L, 7_200L, 25_000L, 17_200L);
        assertThat(result.total().amountMinor()).isEqualTo(94_400);
    }

    @Test
    void firstYearValueIsCappedAtTwelveMonthsButShortTermsUseTheirOwnLength() {
        var twelve = calculator.calculate(order(12, false, false), PartnerTier.REGISTERED, List.of(),
                TestFixtures.properties().commissions());
        var sixty = calculator.calculate(order(60, false, false), PartnerTier.REGISTERED, List.of(),
                TestFixtures.properties().commissions());

        assertThat(twelve.firstYearValue()).isEqualTo(sixty.firstYearValue());
        assertThat(twelve.lines()).singleElement()
                .satisfies(l -> assertThat(l.amount().amountMinor()).isEqualTo(28_800));
    }

    @Test
    void omitsZeroValueComponents() {
        var basis = new CommissionCalculator.OrderBasis("GBP", 12, false, false, List.of());

        var result = calculator.calculate(basis, PartnerTier.GOLD, List.of(), TestFixtures.properties().commissions());

        assertThat(result.lines()).isEmpty();
        assertThat(result.total().isZero()).isTrue();
    }

    @Test
    void formatsBasisPointsAsPercent() {
        assertThat(CommissionCalculator.bpsAsPercent(1250)).isEqualTo("12.50%");
        assertThat(CommissionCalculator.bpsAsPercent(205)).isEqualTo("2.05%");
    }
}

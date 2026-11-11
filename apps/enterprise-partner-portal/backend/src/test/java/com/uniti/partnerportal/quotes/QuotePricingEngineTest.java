package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class QuotePricingEngineTest {

    private final QuotePricingEngine engine = new QuotePricingEngine();

    private static QuoteLine line(int no, String site, String postcode, long mrc, long nrc, long floor) {
        return new QuoteLine(UUID.randomUUID(), no, "FBB-BUS-500", "Business Fibre 500 Mbps", site, postcode, 1,
                mrc, nrc, floor);
    }

    private QuotePricingEngine.PricingResult price(List<QuoteLine> lines, int term, String discount,
                                                   PartnerTier tier, boolean protectedDeal) {
        return engine.price(new QuotePricingEngine.PricingInput(lines, term, new BigDecimal(discount), tier,
                protectedDeal, new BigDecimal("40"), "GBP"));
    }

    @Test
    void appliesTermThenVolumeThenPartnerDiscountInOrder() {
        List<QuoteLine> lines = IntStream.rangeClosed(1, 5)
                .mapToObj(i -> line(i, "Site " + i, "LS1 " + i + "AA", 10_000, 9_900, 5_000))
                .toList();

        var result = price(lines, 36, "5", PartnerTier.GOLD, true);

        // per line: 10000 -10% = 9000, -3% volume = 8730, -5% partner = 8293.5 -> 8294 (HALF_EVEN of 436.5 = 436)
        assertThat(result.listMrc().amountMinor()).isEqualTo(50_000);
        assertThat(result.termDiscount().amountMinor()).isEqualTo(5_000);
        assertThat(result.volumeDiscount().amountMinor()).isEqualTo(1_350);
        assertThat(result.partnerDiscount().amountMinor()).isEqualTo(5 * 436);
        assertThat(result.netMrc().amountMinor()).isEqualTo(5 * 8_294);
        assertThat(result.volumeDiscountPercent()).isEqualByComparingTo("3");
        assertThat(result.isQuotable()).isTrue();
    }

    @Test
    void waivesInstallationOnThirtySixMonthTermsAndChargesItOnShorterTerms() {
        List<QuoteLine> lines = List.of(line(1, "HQ", "M1 1AA", 10_000, 9_900, 5_000));

        var thirtySix = price(lines, 36, "0", PartnerTier.SILVER, false);
        var twentyFour = price(lines, 24, "0", PartnerTier.SILVER, false);

        assertThat(thirtySix.nrcWaived()).isTrue();
        assertThat(thirtySix.nrc().isZero()).isTrue();
        assertThat(thirtySix.totalContractValue().amountMinor()).isEqualTo(9_000L * 36);
        assertThat(twentyFour.nrcWaived()).isFalse();
        assertThat(twentyFour.totalContractValue().amountMinor()).isEqualTo(9_500L * 24 + 9_900);
    }

    @Test
    void sameSiteWithDifferentSpacingAndCaseCountsOnce() {
        List<QuoteLine> lines = List.of(
                line(1, "Head Office", "LS1 4AP", 1_000, 0, 0),
                line(2, " head office ", "ls14ap", 1_000, 0, 0));

        assertThat(QuotePricingEngine.distinctSites(lines)).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({
            "GOLD, true, 15, NONE",
            "GOLD, true, 25, CHANNEL_MANAGER",
            "GOLD, true, 25.001, DEAL_DESK",
            "GOLD, false, 7.5, NONE",
            "GOLD, false, 8, CHANNEL_MANAGER",
            "REGISTERED, true, 16, DEAL_DESK"
    })
    void routesApprovalByDiscountAgainstTierAllowance(PartnerTier tier, boolean protectedDeal, String discount,
                                                      ApprovalLevel expected) {
        var result = price(List.of(line(1, "HQ", "M1 1AA", 100_000, 0, 0)), 12, discount, tier, protectedDeal);

        assertThat(result.approvalLevel()).isEqualTo(expected);
    }

    @Test
    void blocksQuotesBelowFloorAboveMaximumOrWithInvalidTerm() {
        var floorBreach = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 9_000)), 12, "20", PartnerTier.GOLD, true);
        var overMax = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 12, "41", PartnerTier.GOLD, true);
        var badTerm = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 18, "0", PartnerTier.GOLD, true);

        assertThat(floorBreach.floorBreaches()).singleElement()
                .satisfies(b -> assertThat(b.lineNo()).isEqualTo(1));
        assertThat(floorBreach.isQuotable()).isFalse();
        assertThat(overMax.blockers()).anyMatch(b -> b.contains("programme maximum"));
        assertThat(badTerm.blockers()).anyMatch(b -> b.startsWith("Term must be one of"));
    }

    @Test
    void effectiveDiscountReflectsWholeStack() {
        var result = price(List.of(line(1, "HQ", "M1 1AA", 10_000, 0, 0)), 60, "0", PartnerTier.SILVER, false);

        assertThat(result.effectiveDiscountPercent()).isEqualByComparingTo("15.000");
    }
}

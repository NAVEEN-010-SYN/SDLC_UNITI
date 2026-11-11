package com.uniti.partnerportal.commissions.dto;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.commissions.CommissionEntry;
import com.uniti.partnerportal.commissions.CommissionPayout;
import com.uniti.partnerportal.commissions.StatementStatus;
import com.uniti.partnerportal.partner.PartnerTier;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

public final class CommissionDtos {

    private CommissionDtos() {
    }

    public record CommissionRuleRequest(
            @NotBlank @Size(max = 80) String name,
            CatalogProduct.Category productCategory,
            PartnerTier minTier,
            @Min(0) @Max(60) int minTermMonths,
            @Min(0) @Max(2000) int rateBps,
            @PositiveOrZero long flatBonusMinor,
            @NotNull LocalDate validFrom,
            LocalDate validTo) {

        @AssertTrue(message = "a rule must pay a rate, a flat bonus or both")
        public boolean isPaying() {
            return rateBps > 0 || flatBonusMinor > 0;
        }

        @AssertTrue(message = "validTo must not be before validFrom")
        public boolean isWindowValid() {
            return validTo == null || validFrom == null || !validTo.isBefore(validFrom);
        }
    }

    public record CommissionRuleResponse(UUID id, String name, CatalogProduct.Category productCategory,
                                         PartnerTier minTier, int minTermMonths, int rateBps, long flatBonusMinor,
                                         String currency, LocalDate validFrom, LocalDate validTo, boolean active) {
    }

    public record GenerateStatementRequest(@NotNull UUID partnerId, @NotNull YearMonth period) {
    }

    public record DisputeRequest(@NotBlank @Size(max = 1000) String reason) {
    }

    public record AdjustmentRequest(@NotNull Long amountMinor, @NotBlank @Size(max = 300) String description) {

        @AssertTrue(message = "an adjustment cannot be zero")
        public boolean isNonZero() {
            return amountMinor == null || amountMinor != 0;
        }
    }

    public record PayoutPaidRequest(@NotBlank @Size(max = 40) String paymentReference) {
    }

    public record PayoutFailedRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record EntryResponse(UUID id, UUID orderId, String orderReference, CommissionEntry.Type type,
                                String component, String description, long amountMinor, String currency,
                                LocalDate earnedOn) {
    }

    public record StatementResponse(UUID id, String reference, UUID partnerId, LocalDate periodStart,
                                    LocalDate periodEnd, String currency, StatementStatus status, long accruedMinor,
                                    long clawbackMinor, long adjustmentMinor, long broughtForwardMinor,
                                    long netPayableMinor, Instant issuedAt, String disputeReason,
                                    Instant decidedAt, Instant paidAt, boolean disputable) {
    }

    public record PayoutResponse(UUID id, UUID statementId, UUID partnerId, long amountMinor, String currency,
                                 CommissionPayout.Status status, LocalDate scheduledFor, String paymentReference,
                                 Instant paidAt, String failureReason) {
    }

    public record StatementDetailResponse(StatementResponse statement, List<EntryResponse> entries,
                                          PayoutResponse payout) {
    }

    public record CommissionSummaryResponse(String currency, PartnerTier tier, int tierRateBps,
                                            long earnedYearToDateMinor, long unbilledMinor,
                                            long paidYearToDateMinor, long outstandingPayoutMinor) {
    }
}

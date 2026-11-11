package com.uniti.partnerportal.quotes.dto;

import com.uniti.partnerportal.quotes.ApprovalLevel;
import com.uniti.partnerportal.quotes.QuoteApproval;
import com.uniti.partnerportal.quotes.QuoteStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class QuoteDtos {

    private QuoteDtos() {
    }

    public record QuoteLineRequest(
            @NotBlank @Size(max = 40) String sku,
            @NotBlank @Size(max = 120) String siteName,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String sitePostcode,
            @Min(1) @Max(100) int quantity) {
    }

    public record QuoteRequest(
            UUID partnerId,
            UUID dealId,
            @NotBlank @Size(max = 200) String customerName,
            @Pattern(regexp = "^ACC-\\d{8}$", message = "must be an account ID like ACC-12345678") String customerAccountId,
            @NotBlank @Email @Size(max = 200) String customerContactEmail,
            @NotNull Integer termMonths,
            @NotNull @DecimalMin("0.0") @DecimalMax("100.0") @Digits(integer = 3, fraction = 3)
            BigDecimal requestedDiscountPercent,
            @Size(max = 1000) String justification,
            @NotEmpty @Size(max = 200) List<@Valid QuoteLineRequest> lines) {
    }

    public record QuoteDecisionRequest(@NotBlank @Size(max = 500) String note) {
    }

    public record QuoteLineResponse(UUID id, int lineNo, String sku, String productName, String siteName,
                                    String sitePostcode, int quantity, long unitMrcMinor, long unitNrcMinor,
                                    long listMrcMinor, long netMrcMinor) {
    }

    public record QuoteApprovalResponse(int revision, String approver, QuoteApproval.Decision decision,
                                        BigDecimal discountPercent, String note, Instant decidedAt) {
    }

    public record QuoteResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID dealId,
            String customerName,
            String customerAccountId,
            String customerContactEmail,
            int termMonths,
            String currency,
            QuoteStatus status,
            int revision,
            BigDecimal requestedDiscountPercent,
            BigDecimal effectiveDiscountPercent,
            long listMrcMinor,
            long termDiscountMinor,
            long volumeDiscountMinor,
            long partnerDiscountMinor,
            long netMrcMinor,
            long nrcMinor,
            boolean nrcWaived,
            long totalContractValueMinor,
            ApprovalLevel approvalLevel,
            long approvalsReceived,
            String justification,
            Instant validUntil,
            Instant sentAt,
            Instant acceptedAt,
            String closedReason,
            List<QuoteLineResponse> lines,
            List<QuoteApprovalResponse> approvals,
            Instant createdAt) {
    }

    /**
     * Result of a pricing preview: totals plus everything the UI needs to explain the price and
     * whether approval will be required.
     */
    public record PricingPreviewResponse(
            long listMrcMinor,
            long termDiscountMinor,
            long volumeDiscountMinor,
            long partnerDiscountMinor,
            long netMrcMinor,
            long nrcMinor,
            boolean nrcWaived,
            long totalContractValueMinor,
            BigDecimal termDiscountPercent,
            BigDecimal volumeDiscountPercent,
            BigDecimal effectiveDiscountPercent,
            BigDecimal selfApprovedAllowancePercent,
            ApprovalLevel approvalLevel,
            List<String> blockers,
            String currency) {
    }
}

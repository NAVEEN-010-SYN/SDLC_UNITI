package com.uniti.partnerportal.partner.dto;

import com.uniti.partnerportal.partner.KycDocument;
import com.uniti.partnerportal.partner.KycDocumentType;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.partner.PartnerTier;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class PartnerDtos {

    private PartnerDtos() {
    }

    @Schema(description = "Public application to join the Uniti partner programme")
    public record PartnerApplicationRequest(
            @NotBlank @Size(max = 200) String legalName,
            @Size(max = 200) String tradingName,
            @NotBlank @Pattern(regexp = "^[A-Z0-9]{8}$", message = "must be an 8-character company registration number")
            String companyNumber,
            @Pattern(regexp = "^(GB)?[0-9]{9}([0-9]{3})?$", message = "must be a valid VAT number") String vatNumber,
            @Size(max = 200) @Pattern(regexp = "^https?://.+", message = "must be an http(s) URL") String website,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$", message = "must be a valid phone number") String contactPhone,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String postcode,
            @NotBlank @Pattern(regexp = "^[A-Z]{2}$") String countryCode,
            boolean acceptedProgrammeTerms) {

        @AssertTrue(message = "programme terms must be accepted")
        public boolean isTermsAccepted() {
            return acceptedProgrammeTerms;
        }
    }

    public record PartnerProfileUpdateRequest(
            @Size(max = 200) String tradingName,
            @Size(max = 200) @Pattern(regexp = "^https?://.+") String website,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$") String contactPhone,
            @NotBlank @Size(max = 200) String addressLine1,
            @Size(max = 200) String addressLine2,
            @NotBlank @Size(max = 100) String city,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$") String postcode) {
    }

    public record PartnerResponse(
            UUID id,
            String reference,
            String legalName,
            String tradingName,
            String companyNumber,
            String vatNumber,
            String website,
            String contactName,
            String contactEmail,
            String contactPhone,
            String addressLine1,
            String addressLine2,
            String city,
            String postcode,
            String countryCode,
            PartnerStatus status,
            String statusReason,
            PartnerTier tier,
            TierBenefits tierBenefits,
            long trailingRevenueMinor,
            String currency,
            Instant tierEvaluatedAt,
            Instant activatedAt,
            Instant createdAt) {
    }

    public record TierBenefits(int commissionRateBps,
                               BigDecimal selfApprovedDiscountPercent,
                               int mdfAccrualBps,
                               int seatLimit) {
    }

    public record PartnerSummary(UUID id, String reference, String displayName, PartnerStatus status,
                                 PartnerTier tier, Instant createdAt) {
    }

    public record KycDocumentRequest(
            @NotNull KycDocumentType type,
            @NotBlank @Size(max = 255) String fileName,
            @NotBlank @Size(max = 500) String storageKey,
            @NotBlank @Pattern(regexp = "^[a-f0-9]{64}$", message = "must be a hex SHA-256 digest") String sha256,
            @PastOrPresent LocalDate issuedOn) {
    }

    public record KycDocumentResponse(UUID id, KycDocumentType type, String fileName, KycDocument.Status status,
                                      LocalDate issuedOn, Instant uploadedAt, String uploadedBy,
                                      Instant reviewedAt, String reviewedBy, String rejectionReason,
                                      boolean stale) {
    }

    public record KycReviewRequest(@NotNull Boolean approved, @Size(max = 500) String reason) {

        @AssertTrue(message = "a reason is required when rejecting a document")
        public boolean isReasonPresentWhenRejected() {
            return approved == null || approved || (reason != null && !reason.isBlank());
        }
    }

    public record KycChecklist(List<ChecklistItem> items, boolean readyForReview, boolean readyForApproval) {
    }

    public record ChecklistItem(KycDocumentType type, boolean required, KycDocument.Status status, boolean stale) {
    }

    public record StatusChangeRequest(@NotBlank @Size(max = 500) String reason) {
    }

    public record TierEvaluationResponse(PartnerTier previousTier, PartnerTier newTier, long trailingRevenueMinor,
                                         int certifiedAgents, boolean changed, String note) {
    }
}

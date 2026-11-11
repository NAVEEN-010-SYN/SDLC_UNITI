package com.uniti.partnerportal.deals.dto;

import com.uniti.partnerportal.deals.DealStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class DealDtos {

    private DealDtos() {
    }

    public record RegisterDealRequest(
            UUID partnerId,
            UUID leadId,
            @NotBlank @Size(max = 200) String customerName,
            @Pattern(regexp = "^[A-Z0-9]{8}$", message = "must be an 8-character company registration number")
            String customerCompanyNumber,
            @Size(max = 200) String customerWebsite,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String customerPostcode,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Min(1) @Max(500) int siteCount,
            @Positive long estimatedMrcMinor,
            @NotNull @Future LocalDate expectedCloseDate,
            @NotBlank @Size(max = 200) String productInterest) {
    }

    public record DealDecisionRequest(@NotBlank @Size(max = 500) String reason, boolean overrideConflicts) {
    }

    public record DealOutcomeRequest(@NotNull DealStatus outcome, @Size(max = 500) String reason) {
    }

    public record DealResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID leadId,
            String customerName,
            String customerCompanyNumber,
            String customerDomain,
            String customerPostcode,
            String contactName,
            String contactEmail,
            int siteCount,
            long estimatedMrcMinor,
            String currency,
            LocalDate expectedCloseDate,
            String productInterest,
            DealStatus status,
            boolean hasConflict,
            List<ConflictResponse> conflicts,
            Instant submittedAt,
            Instant decidedAt,
            String decisionReason,
            LocalDate protectedUntil,
            int extensionsUsed,
            boolean extensionAvailable) {
    }

    /**
     * Conflict details shown to a partner deliberately omit the other partner's identity; only
     * internal users see whose claim overlaps.
     */
    public record ConflictResponse(String conflictingReference, UUID conflictingPartnerId, String matchReasons,
                                   int score, Instant detectedAt) {
    }

    public record ConflictCheckResponse(boolean conflict, boolean ownDuplicate, List<String> matchReasons) {
    }
}

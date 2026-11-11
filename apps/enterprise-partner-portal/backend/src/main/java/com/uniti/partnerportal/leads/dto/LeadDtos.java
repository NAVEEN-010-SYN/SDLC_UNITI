package com.uniti.partnerportal.leads.dto;

import com.uniti.partnerportal.leads.Lead;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class LeadDtos {

    private LeadDtos() {
    }

    public record LeadRequest(
            @NotBlank @Size(max = 200) String companyName,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$", message = "must be a valid phone number") String contactPhone,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String postcode,
            @Min(1) @Max(500) int siteCount,
            @PositiveOrZero long estimatedMrcMinor,
            @Size(max = 200) String productInterest,
            @NotNull Lead.Source source,
            @Size(max = 2000) String notes,
            @Future Instant nextActionAt) {
    }

    public record LeadTransitionRequest(@NotNull Lead.Status status, @Size(max = 300) String reason) {
    }

    public record AssignLeadRequest(@NotBlank @Size(max = 120) String ownerSubject) {
    }

    public record ConvertLeadRequest(
            @Pattern(regexp = "^[A-Z0-9]{8}$") String customerCompanyNumber,
            @Size(max = 200) String customerWebsite,
            @NotNull @Future LocalDate expectedCloseDate) {
    }

    public record LeadResponse(
            UUID id,
            String reference,
            UUID partnerId,
            String ownerSubject,
            String companyName,
            String contactName,
            String contactEmail,
            String contactPhone,
            String postcode,
            int siteCount,
            long estimatedMrcMinor,
            String productInterest,
            Lead.Source source,
            Lead.Status status,
            int score,
            String scoreBand,
            String notes,
            Instant nextActionAt,
            String disqualifyReason,
            UUID convertedDealId,
            Instant createdAt) {
    }
}

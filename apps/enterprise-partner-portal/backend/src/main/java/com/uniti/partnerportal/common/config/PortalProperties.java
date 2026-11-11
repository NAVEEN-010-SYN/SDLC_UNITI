package com.uniti.partnerportal.common.config;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.Map;

/**
 * Strongly-typed view of the {@code partner-portal.*} configuration tree. Business tunables
 * (protection windows, approval thresholds, SLA targets) live here so they can be changed per
 * environment without a code change.
 */
@Validated
@ConfigurationProperties(prefix = "partner-portal")
public record PortalProperties(
        @NotNull Security security,
        @NotNull Cors cors,
        @NotNull Pricing pricing,
        @NotNull Deals deals,
        @NotNull Commissions commissions,
        @NotNull Mdf mdf,
        @NotNull Cases cases) {

    public record Security(@NotBlank String rolesClaim, @NotBlank String partnerClaim) {
    }

    public record Cors(List<String> allowedOrigins) {
    }

    public record Pricing(@NotBlank String defaultCurrency,
                          @Min(1) int quoteValidityDays,
                          @Min(0) int maxDiscountPercent) {
    }

    public record Deals(@Min(1) int protectionDays,
                        @Min(0) int extensionDays,
                        @Min(0) int maxExtensions,
                        @DecimalMin("0.5") @DecimalMax("1.0") double nameSimilarityThreshold) {
    }

    public record Commissions(@Min(0) int clawbackWindowDays,
                              @Min(0) int dealRegistrationUpliftBps,
                              @Min(0) long newLogoBonusMinor) {
    }

    public record Mdf(@Min(1) int claimWindowDays, @Min(1) int coOpSharePercent) {
    }

    public record Cases(Map<String, Integer> firstResponseHours, Map<String, Integer> resolutionHours) {

        public int firstResponseHoursFor(String priority) {
            return firstResponseHours.getOrDefault(priority, 24);
        }

        public int resolutionHoursFor(String priority) {
            return resolutionHours.getOrDefault(priority, 120);
        }
    }
}

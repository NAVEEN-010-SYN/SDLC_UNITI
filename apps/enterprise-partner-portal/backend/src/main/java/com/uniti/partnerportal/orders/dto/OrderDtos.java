package com.uniti.partnerportal.orders.dto;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.orders.OrderEvent;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.ProvisioningStage;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    public record CreateOrderRequest(
            @NotNull UUID quoteId,
            @Size(max = 40) @Pattern(regexp = "^[A-Za-z0-9/_-]*$", message = "may contain letters, digits, / _ -")
            String purchaseOrderNumber,
            @Future LocalDate requestedInstallDate) {
    }

    public record OrderReasonRequest(@NotBlank @Size(max = 500) String reason) {
    }

    /**
     * Provisioning update for one site, sent by internal users or the provisioning integration.
     */
    public record SiteProgressRequest(
            @NotNull ProvisioningStage stage,
            @Size(max = 500) String note,
            LocalDate engineerVisitDate,
            @Size(max = 40) String serviceId) {
    }

    public record OrderSiteResponse(UUID id, int siteNo, String siteName, String sitePostcode, String sku,
                                    String productName, CatalogProduct.Category productCategory, int quantity,
                                    long netMrcMinor, ProvisioningStage stage, LocalDate engineerVisitDate,
                                    String serviceId, Instant stageUpdatedAt, String blockerNote) {
    }

    public record OrderEventResponse(OrderEvent.Type type, String actor, String detail, Instant occurredAt) {
    }

    public record OrderResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID quoteId,
            String quoteReference,
            UUID dealId,
            String customerName,
            String customerAccountId,
            boolean newLogo,
            String purchaseOrderNumber,
            int termMonths,
            String currency,
            long monthlyRecurringMinor,
            long oneOffMinor,
            OrderStatus status,
            String statusReason,
            int sitesLive,
            int sitesTotal,
            LocalDate requestedInstallDate,
            Instant submittedAt,
            Instant activatedAt,
            Instant ceasedAt,
            List<OrderSiteResponse> sites,
            List<OrderEventResponse> timeline,
            Instant createdAt) {
    }
}

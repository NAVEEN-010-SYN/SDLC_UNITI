package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.CreateOrderRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderEventResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderReasonRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderSiteResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.SiteProgressRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders", description = "Orders placed for customers and provisioning status")
public class OrderController {

    private final OrderService service;
    private final CurrentUserProvider currentUser;

    public OrderController(OrderService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PageResponse<OrderResponse> search(@RequestParam(required = false) UUID partnerId,
                                              @RequestParam(required = false) OrderStatus status,
                                              @RequestParam(required = false) String q,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer pageSize) {
        var result = service.search(partnerId, status, q, PageResponse.pageable(page, pageSize), currentUser.get());
        return PageResponse.from(result, OrderController::toResponse);
    }

    @PostMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Order an accepted quote")
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        PartnerOrder order = service.createFromQuote(request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/orders/" + order.getId())).body(toResponse(order));
    }

    @GetMapping("/{orderId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Order with per-site provisioning status and timeline")
    public OrderResponse get(@PathVariable UUID orderId) {
        return toResponse(service.get(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/cancel")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public OrderResponse cancel(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.cancel(orderId, request.reason(), currentUser.get()));
    }

    @PostMapping("/{orderId}/resubmit")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public OrderResponse resubmit(@PathVariable UUID orderId) {
        return toResponse(service.resubmit(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/validate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse validate(@PathVariable UUID orderId) {
        return toResponse(service.validate(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/provision")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse provision(@PathVariable UUID orderId) {
        return toResponse(service.startProvisioning(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/fail")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse fail(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.fail(orderId, request.reason(), currentUser.get()));
    }

    @PostMapping("/{orderId}/sites/{siteId}/progress")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record provisioning progress for one site")
    public OrderResponse progress(@PathVariable UUID orderId, @PathVariable UUID siteId,
                                  @Valid @RequestBody SiteProgressRequest request) {
        return toResponse(service.updateSite(orderId, siteId, request, currentUser.get()));
    }

    @PostMapping("/{orderId}/early-termination")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record early termination of an active service (may trigger clawback)")
    public OrderResponse terminate(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.recordEarlyTermination(orderId, request.reason(), currentUser.get()));
    }

    static OrderResponse toResponse(PartnerOrder o) {
        var sites = o.getSites().stream()
                .map(s -> new OrderSiteResponse(s.getId(), s.getSiteNo(), s.getSiteName(), s.getSitePostcode(),
                        s.getSku(), s.getProductName(), s.getProductCategory(), s.getQuantity(), s.getNetMrcMinor(),
                        s.getStage(), s.getEngineerVisitDate(), s.getServiceId(), s.getStageUpdatedAt(),
                        s.getBlockerNote()))
                .toList();
        var timeline = o.getEvents().stream()
                .map(e -> new OrderEventResponse(e.getType(), e.getActor(), e.getDetail(), e.getOccurredAt()))
                .toList();
        int live = (int) o.getSites().stream().filter(s -> s.getStage() == ProvisioningStage.LIVE).count();
        return new OrderResponse(o.getId(), o.getReference(), o.getPartnerId(), o.getQuoteId(), o.getQuoteReference(),
                o.getDealId(), o.getCustomerName(), o.getCustomerAccountId(), o.isNewLogo(),
                o.getPurchaseOrderNumber(), o.getTermMonths(), o.getCurrency(), o.getMonthlyRecurringMinor(),
                o.getOneOffMinor(), o.getStatus(), o.getStatusReason(), live, o.getSites().size(),
                o.getRequestedInstallDate(), o.getSubmittedAt(), o.getActivatedAt(), o.getCeasedAt(), sites, timeline,
                o.getCreatedAt());
    }
}

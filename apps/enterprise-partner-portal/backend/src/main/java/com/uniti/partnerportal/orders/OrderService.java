package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.orders.dto.OrderDtos.CreateOrderRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.SiteProgressRequest;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.Quote;
import com.uniti.partnerportal.quotes.QuoteLine;
import com.uniti.partnerportal.quotes.QuoteService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Orders placed on behalf of customers and their provisioning progress. Partners create and may
 * cancel orders before provisioning starts; validation, provisioning updates and early
 * termination are internal (channel desk or the provisioning integration).
 */
@Service
@Transactional
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final PartnerOrderRepository orders;
    private final QuoteService quotes;
    private final CatalogProductRepository catalog;
    private final PartnerService partners;
    private final ReferenceGenerator references;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public OrderService(PartnerOrderRepository orders, QuoteService quotes, CatalogProductRepository catalog,
                        PartnerService partners, ReferenceGenerator references, ApplicationEventPublisher events,
                        Clock clock) {
        this.orders = orders;
        this.quotes = quotes;
        this.catalog = catalog;
        this.partners = partners;
        this.references = references;
        this.events = events;
        this.clock = clock;
    }

    /**
     * Turns an accepted quote into a submitted order. Customers without an account get one
     * minted here and the order is flagged as a new logo (which earns a commission bonus).
     */
    public PartnerOrder createFromQuote(CreateOrderRequest request, CurrentUser user) {
        orders.findByQuoteId(request.quoteId()).ifPresent(existing -> {
            throw new PortalException.Conflict("order.duplicate_quote",
                    "Quote has already been ordered as " + existing.getReference())
                    .withDetail("orderId", existing.getId().toString());
        });
        Quote quote = quotes.claimForOrder(request.quoteId(), user);
        partners.requireTransactingPartner(quote.getPartnerId());
        Instant now = Instant.now(clock);

        PartnerOrder order = new PartnerOrder(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.ORDER),
                quote.getPartnerId(), quote.getId(), quote.getReference(), quote.getCurrency(), user.subject());
        order.setDealId(quote.getDealId());
        order.setCustomerName(quote.getCustomerName());
        order.setCustomerContactEmail(quote.getCustomerContactEmail());
        order.setTermMonths(quote.getTermMonths());
        order.setPurchaseOrderNumber(request.purchaseOrderNumber());
        order.setRequestedInstallDate(request.requestedInstallDate());
        order.setCharges(quote.getNetMrcMinor(), quote.getNrcMinor());
        boolean newLogo = quote.getCustomerAccountId() == null;
        order.assignAccount(newLogo ? references.next(ReferenceGenerator.Kind.ACCOUNT)
                : quote.getCustomerAccountId(), newLogo);

        Map<String, CatalogProduct> products = catalog.findBySkuIn(
                        quote.getLines().stream().map(QuoteLine::getSku).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CatalogProduct::getSku, Function.identity()));
        for (QuoteLine line : quote.getLines()) {
            CatalogProduct product = products.get(line.getSku());
            if (product == null) {
                throw new PortalException.BusinessRule("order.product_missing",
                        "Product " + line.getSku() + " is no longer in the catalog");
            }
            order.addSite(new OrderSite(UUID.randomUUID(), line.getLineNo(), line.getSiteName(),
                    line.getSitePostcode(), line.getSku(), line.getProductName(), product.getCategory(),
                    line.getQuantity(), line.getNetMrcMinor()));
        }
        order.transitionTo(OrderStatus.SUBMITTED, user.subject(), "Created from quote " + quote.getReference(), now);
        PartnerOrder saved = orders.save(order);
        log.info("order_submitted orderRef={} quoteRef={} newLogo={}", saved.getReference(), quote.getReference(),
                newLogo);
        return saved;
    }

    @Transactional(readOnly = true)
    public PartnerOrder get(UUID orderId, CurrentUser user) {
        PartnerOrder order = load(orderId);
        user.assertCanAccess(order.getPartnerId());
        return order;
    }

    @Transactional(readOnly = true)
    public Page<PartnerOrder> search(UUID partnerId, OrderStatus status, String search, Pageable pageable,
                                     CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        String term = search == null || search.isBlank() ? null : search.trim();
        return orders.search(scope, status, term, pageable);
    }

    public PartnerOrder cancel(UUID orderId, String reason, CurrentUser user) {
        PartnerOrder order = get(orderId, user);
        order.transitionTo(OrderStatus.CANCELLED, user.subject(), reason, Instant.now(clock));
        return order;
    }

    public PartnerOrder validate(UUID orderId, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.VALIDATED, manager.subject(), "Order validated", Instant.now(clock));
        return order;
    }

    public PartnerOrder startProvisioning(UUID orderId, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.PROVISIONING, manager.subject(), "Provisioning started", Instant.now(clock));
        return order;
    }

    public PartnerOrder fail(UUID orderId, String reason, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.FAILED, manager.subject(), reason, Instant.now(clock));
        return order;
    }

    /**
     * A failed order can be resubmitted by the partner once the cause has been fixed (for
     * example a wrong site address); sites keep the provisioning progress already made.
     */
    public PartnerOrder resubmit(UUID orderId, CurrentUser user) {
        PartnerOrder order = get(orderId, user);
        order.transitionTo(OrderStatus.SUBMITTED, user.subject(), "Resubmitted after failure", Instant.now(clock));
        return order;
    }

    /**
     * Records progress on one site. When the last site goes live the order becomes ACTIVE and
     * an {@link OrderEvents.OrderActivated} event is published for commission accrual.
     */
    public PartnerOrder updateSite(UUID orderId, UUID siteId, SiteProgressRequest request, CurrentUser actor) {
        PartnerOrder order = load(orderId);
        if (order.getStatus() != OrderStatus.PROVISIONING) {
            throw new PortalException.BusinessRule("order.not_provisioning",
                    "Site progress can only be recorded while the order is provisioning");
        }
        OrderSite site = order.getSites().stream()
                .filter(s -> s.getId().equals(siteId))
                .findFirst()
                .orElseThrow(() -> new PortalException.NotFound("OrderSite", siteId));
        if (!site.canMoveTo(request.stage())) {
            throw new PortalException.Conflict("order.site_invalid_stage",
                    "Site " + site.getSiteNo() + " cannot move from " + site.getStage() + " to " + request.stage());
        }
        if (request.stage() == ProvisioningStage.BLOCKED && (request.note() == null || request.note().isBlank())) {
            throw new PortalException.BusinessRule("order.blocker_note_required", "Explain why the site is blocked");
        }
        if (request.stage() == ProvisioningStage.LIVE && blankToNull(request.serviceId()) == null
                && site.getServiceId() == null) {
            throw new PortalException.BusinessRule("order.service_id_required",
                    "A live site must carry the service ID it was provisioned as");
        }
        Instant now = Instant.now(clock);
        site.moveTo(request.stage(), request.note(), now);
        if (request.engineerVisitDate() != null) {
            site.setEngineerVisitDate(request.engineerVisitDate());
        }
        if (blankToNull(request.serviceId()) != null) {
            site.setServiceId(request.serviceId().trim());
        }
        String detail = "Site " + site.getSiteNo() + " (" + site.getSiteName() + ") -> " + request.stage()
                + (request.note() == null || request.note().isBlank() ? "" : ": " + request.note());
        order.record(OrderEvent.Type.SITE_UPDATED, actor.subject(), detail, now);

        if (order.allSitesLive()) {
            order.transitionTo(OrderStatus.ACTIVE, actor.subject(), "All sites live", now);
            events.publishEvent(new OrderEvents.OrderActivated(order.getId(), order.getPartnerId(), now));
            log.info("order_activated orderRef={} mrc={}", order.getReference(), order.getMonthlyRecurringMinor());
        }
        return order;
    }

    /**
     * Records that the customer terminated an active service early. Commissions decides whether
     * this falls inside the clawback window.
     */
    public PartnerOrder recordEarlyTermination(UUID orderId, String reason, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        if (order.getStatus() != OrderStatus.ACTIVE) {
            throw new PortalException.BusinessRule("order.not_active", "Only active orders can be terminated");
        }
        if (order.getCeasedAt() != null) {
            throw new PortalException.Conflict("order.already_ceased", "Termination has already been recorded");
        }
        Instant now = Instant.now(clock);
        order.markCeased(now, reason);
        order.record(OrderEvent.Type.NOTE, manager.subject(), "Service terminated early: " + reason, now);
        events.publishEvent(new OrderEvents.OrderCeased(order.getId(), order.getPartnerId(), order.getActivatedAt(),
                now, reason));
        return order;
    }

    @Transactional(readOnly = true)
    public PartnerOrder load(UUID orderId) {
        return orders.findById(orderId).orElseThrow(() -> new PortalException.NotFound("Order", orderId));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}

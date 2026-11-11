package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.TestFixtures;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private PartnerOrderRepository orders;
    @Mock
    private QuoteService quotes;
    @Mock
    private CatalogProductRepository catalog;
    @Mock
    private PartnerService partners;
    @Mock
    private ReferenceGenerator references;
    @Mock
    private ApplicationEventPublisher events;

    private OrderService service;
    private final CurrentUser agent = TestFixtures.agent(PARTNER_ID);
    private final CurrentUser manager = TestFixtures.manager("cm-1");

    @BeforeEach
    void setUp() {
        service = new OrderService(orders, quotes, catalog, partners, references, events, TestFixtures.CLOCK);
        when(references.next(ReferenceGenerator.Kind.ORDER)).thenReturn("ORD-2026-000001");
        when(references.next(ReferenceGenerator.Kind.ACCOUNT)).thenReturn("ACC-50000001");
        when(orders.save(any(PartnerOrder.class))).thenAnswer(inv -> inv.getArgument(0));
        when(catalog.findBySkuIn(anyCollection())).thenReturn(List.of(new CatalogProduct(UUID.randomUUID(),
                "FBB-BUS-500", "Business Fibre 500 Mbps", CatalogProduct.Category.BROADBAND, 500, 5_500, 9_900,
                4_000, 12, true, "GBP")));
    }

    private Quote acceptedQuote(String accountId) {
        Quote quote = new Quote(UUID.randomUUID(), "QT-2026-000009", PARTNER_ID, "GBP");
        quote.setCustomerName("Northwind Logistics");
        quote.setCustomerAccountId(accountId);
        quote.setCustomerContactEmail("it@northwind.example");
        quote.setTermMonths(36);
        quote.replaceLines(List.of(
                new QuoteLine(UUID.randomUUID(), 1, "FBB-BUS-500", "Business Fibre 500 Mbps", "HQ", "LS1 4AP", 1,
                        5_500, 9_900, 4_000),
                new QuoteLine(UUID.randomUUID(), 2, "FBB-BUS-500", "Business Fibre 500 Mbps", "Depot", "LS9 8AB", 1,
                        5_500, 9_900, 4_000)));
        when(quotes.claimForOrder(quote.getId(), agent)).thenReturn(quote);
        return quote;
    }

    private PartnerOrder provisioningOrder() {
        PartnerOrder order = service.createFromQuote(
                new CreateOrderRequest(acceptedQuote("ACC-12345678").getId(), "PO-77", null), agent);
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));
        service.validate(order.getId(), manager);
        service.startProvisioning(order.getId(), manager);
        return order;
    }

    @Test
    void createsOneSitePerQuoteLineAndMintsAnAccountForNewLogos() {
        Quote quote = acceptedQuote(null);

        PartnerOrder order = service.createFromQuote(new CreateOrderRequest(quote.getId(), null, null), agent);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.SUBMITTED);
        assertThat(order.isNewLogo()).isTrue();
        assertThat(order.getCustomerAccountId()).isEqualTo("ACC-50000001");
        assertThat(order.getSites()).extracting(OrderSite::getSiteName).containsExactly("HQ", "Depot");
        assertThat(order.getSites()).allSatisfy(s ->
                assertThat(s.getProductCategory()).isEqualTo(CatalogProduct.Category.BROADBAND));
        assertThat(order.getEvents()).singleElement()
                .satisfies(e -> assertThat(e.getDetail()).contains("DRAFT -> SUBMITTED"));
    }

    @Test
    void aQuoteCanOnlyBeOrderedOnce() {
        PartnerOrder existing = new PartnerOrder(UUID.randomUUID(), "ORD-2026-000000", PARTNER_ID, UUID.randomUUID(),
                "QT-2026-000009", "GBP", "agent-1");
        UUID quoteId = UUID.randomUUID();
        when(orders.findByQuoteId(quoteId)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.createFromQuote(new CreateOrderRequest(quoteId, null, null), agent))
                .isInstanceOf(PortalException.Conflict.class);
        verify(quotes, never()).claimForOrder(any(), any());
    }

    @Test
    void activatesAndPublishesWhenTheLastSiteGoesLive() {
        PartnerOrder order = provisioningOrder();
        UUID first = order.getSites().get(0).getId();
        UUID second = order.getSites().get(1).getId();

        service.updateSite(order.getId(), first, new SiteProgressRequest(ProvisioningStage.LIVE, null, null, "SVC-1"),
                manager);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.PROVISIONING);

        service.updateSite(order.getId(), second, new SiteProgressRequest(ProvisioningStage.LIVE, null, null, "SVC-2"),
                manager);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.ACTIVE);
        assertThat(order.getActivatedAt()).isEqualTo(TestFixtures.NOW);
        verify(events).publishEvent(new OrderEvents.OrderActivated(order.getId(), PARTNER_ID, TestFixtures.NOW));
    }

    @Test
    void sitesNeverMoveBackwardsAndUnblockOnlyForward() {
        PartnerOrder order = provisioningOrder();
        UUID site = order.getSites().get(0).getId();
        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.ENGINEER_BOOKED, null, null, null), manager);

        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.SURVEY_COMPLETE, null, null, null), manager))
                .isInstanceOf(PortalException.Conflict.class);

        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BLOCKED, "Wayleave refused", null, null), manager);
        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BUILD_SCHEDULED, null, null, null), manager))
                .isInstanceOf(PortalException.Conflict.class);
        service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.INSTALLED, null, null, null), manager);

        assertThat(order.getSites().get(0).getStage()).isEqualTo(ProvisioningStage.INSTALLED);
        assertThat(order.getSites().get(0).getBlockerNote()).isNull();
    }

    @Test
    void liveSitesRequireAServiceIdAndBlockersRequireANote() {
        PartnerOrder order = provisioningOrder();
        UUID site = order.getSites().get(0).getId();

        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.LIVE, null, null, " "), manager))
                .hasMessageContaining("service ID");
        assertThatThrownBy(() -> service.updateSite(order.getId(), site,
                new SiteProgressRequest(ProvisioningStage.BLOCKED, null, null, null), manager))
                .hasMessageContaining("blocked");
    }

    @Test
    void cancellationIsRefusedOnceProvisioningHasStarted() {
        PartnerOrder order = provisioningOrder();

        assertThatThrownBy(() -> service.cancel(order.getId(), "Customer changed mind", agent))
                .isInstanceOf(PortalException.InvalidTransition.class);
    }
}

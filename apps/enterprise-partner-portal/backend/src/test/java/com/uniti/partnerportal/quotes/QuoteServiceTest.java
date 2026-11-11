package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerTier;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QuoteServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private QuoteRepository quotes;
    @Mock
    private CatalogProductRepository catalog;
    @Mock
    private PartnerService partners;
    @Mock
    private DealRegistrationService deals;
    @Mock
    private ReferenceGenerator references;

    private QuoteService service;
    private final CurrentUser agent = TestFixtures.agent(PARTNER_ID);

    @BeforeEach
    void setUp() {
        service = new QuoteService(quotes, catalog, new QuotePricingEngine(), partners, deals, references,
                TestFixtures.properties(), TestFixtures.CLOCK);
        Partner partner = TestFixtures.activePartner(PARTNER_ID, PartnerTier.SILVER);
        when(partners.requireTransactingPartner(PARTNER_ID)).thenReturn(partner);
        when(references.next(ReferenceGenerator.Kind.QUOTE)).thenReturn("QT-2026-000001");
        when(quotes.save(any(Quote.class))).thenAnswer(inv -> inv.getArgument(0));
        when(catalog.findBySkuIn(anyCollection())).thenReturn(List.of(
                new CatalogProduct(UUID.randomUUID(), "FBB-BUS-500", "Business Fibre 500 Mbps",
                        CatalogProduct.Category.BROADBAND, 500, 5_500, 9_900, 4_000, 12, true, "GBP"),
                new CatalogProduct(UUID.randomUUID(), "SDW-VC-EDGE", "SD-WAN Edge",
                        CatalogProduct.Category.SDWAN, null, 18_500, 25_000, 14_000, 36, true, "GBP")));
    }

    private static QuoteRequest request(int term, String discount, String justification, String... skus) {
        List<QuoteLineRequest> lines = java.util.Arrays.stream(skus)
                .map(sku -> new QuoteLineRequest(sku, "Head Office", "LS1 4AP", 3))
                .toList();
        return new QuoteRequest(null, null, "Northwind Logistics", null, "IT@northwind.example", term,
                new BigDecimal(discount), justification, lines);
    }

    private Quote created(QuoteRequest request) {
        Quote quote = service.create(request, agent);
        when(quotes.findById(quote.getId())).thenReturn(Optional.of(quote));
        return quote;
    }

    @Test
    void createSnapshotsCatalogPricesAndForcesQuantityOneForPerSiteProducts() {
        Quote quote = created(request(36, "0", null, "FBB-BUS-500"));

        assertThat(quote.getLines()).singleElement().satisfies(l -> {
            assertThat(l.getQuantity()).isEqualTo(1);
            assertThat(l.getUnitMrcMinor()).isEqualTo(5_500);
            assertThat(l.getUnitFloorMrcMinor()).isEqualTo(4_000);
        });
        assertThat(quote.getCustomerContactEmail()).isEqualTo("it@northwind.example");
        assertThat(quote.getNetMrcMinor()).isEqualTo(4_950);
    }

    @Test
    void rejectsProductsWhoseMinimumTermExceedsTheQuoteTerm() {
        assertThatThrownBy(() -> service.create(request(24, "0", null, "SDW-VC-EDGE"), agent))
                .isInstanceOf(PortalException.BusinessRule.class)
                .satisfies(ex -> assertThat(((PortalException) ex).getDetails().get("problems").toString())
                        .contains("minimum term of 36"));
    }

    @Test
    void rejectsUnknownSkus() {
        assertThatThrownBy(() -> service.create(request(12, "0", null, "NOPE"), agent))
                .hasMessageContaining("invalid");
    }

    @Test
    void submitWithinAllowanceSelfApprovesAndStartsValidity() {
        Quote quote = created(request(12, "4", null, "FBB-BUS-500"));

        service.submit(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.APPROVED);
        assertThat(quote.getValidUntil()).isEqualTo(TestFixtures.NOW.plus(30, ChronoUnit.DAYS));
    }

    @Test
    void submitNeedingApprovalRequiresJustification() {
        Quote quote = created(request(12, "12", null, "FBB-BUS-500"));

        assertThatThrownBy(() -> service.submit(quote.getId(), agent))
                .hasMessageContaining("justification");
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.DRAFT);
    }

    @Test
    void dealDeskQuotesNeedTwoDistinctManagers() {
        Quote quote = created(request(36, "18", "Competitive displacement of incumbent", "FBB-BUS-500"));
        service.submit(quote.getId(), agent);
        assertThat(quote.getApprovalLevel()).isEqualTo(ApprovalLevel.DEAL_DESK);

        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-1"));
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.PENDING_APPROVAL);

        assertThatThrownBy(() -> service.approve(quote.getId(), "again", TestFixtures.manager("cm-1")))
                .isInstanceOf(PortalException.Conflict.class);

        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-2"));
        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.APPROVED);
        assertThat(quote.approvalsForCurrentRevision()).isEqualTo(2);
    }

    @Test
    void revisingVoidsEarlierApprovals() {
        Quote quote = created(request(12, "12", "Price match", "FBB-BUS-500"));
        service.submit(quote.getId(), agent);
        service.approve(quote.getId(), "ok", TestFixtures.manager("cm-1"));

        service.revise(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.DRAFT);
        assertThat(quote.getRevision()).isEqualTo(2);
        assertThat(quote.approvalsForCurrentRevision()).isZero();
    }

    @Test
    void onlyAcceptedQuotesCanBeClaimedForAnOrder() {
        Quote quote = created(request(12, "0", null, "FBB-BUS-500"));
        service.submit(quote.getId(), agent);

        assertThatThrownBy(() -> service.claimForOrder(quote.getId(), agent))
                .hasMessageContaining("Only accepted quotes");

        service.markSent(quote.getId(), agent);
        service.recordCustomerDecision(quote.getId(), true, null, agent);
        service.claimForOrder(quote.getId(), agent);

        assertThat(quote.getStatus()).isEqualTo(QuoteStatus.ORDERED);
    }

    @Test
    void anotherPartnerCannotReadTheQuote() {
        Quote quote = created(request(12, "0", null, "FBB-BUS-500"));

        assertThatThrownBy(() -> service.get(quote.getId(), TestFixtures.agent(UUID.randomUUID())))
                .isInstanceOf(PortalException.Forbidden.class);
    }
}

package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.TestFixtures;
import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.orders.OrderSite;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.PartnerOrder;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerTier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CommissionServiceTest {

    private static final UUID PARTNER_ID = UUID.randomUUID();

    @Mock
    private CommissionRuleRepository rules;
    @Mock
    private CommissionEntryRepository entries;
    @Mock
    private CommissionStatementRepository statements;
    @Mock
    private CommissionPayoutRepository payouts;
    @Mock
    private PartnerOrderRepository orders;
    @Mock
    private PartnerService partners;
    @Mock
    private ReferenceGenerator references;

    private CommissionService service;

    @BeforeEach
    void setUp() {
        service = new CommissionService(rules, entries, statements, payouts, orders, partners,
                new CommissionCalculator(), references, TestFixtures.properties(), TestFixtures.CLOCK);
        when(partners.load(PARTNER_ID)).thenReturn(TestFixtures.activePartner(PARTNER_ID, PartnerTier.SILVER));
        when(references.next(ReferenceGenerator.Kind.STATEMENT)).thenReturn("CS-2026-000001");
        when(statements.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static PartnerOrder activeOrder(boolean newLogo) {
        PartnerOrder order = new PartnerOrder(UUID.randomUUID(), "ORD-2026-000001", PARTNER_ID, UUID.randomUUID(),
                "QT-2026-000001", "GBP", "agent-1");
        order.setTermMonths(36);
        order.assignAccount("ACC-50000001", newLogo);
        order.addSite(new OrderSite(UUID.randomUUID(), 1, "HQ", "LS1 4AP", "FBB-BUS-500", "Fibre 500",
                CatalogProduct.Category.BROADBAND, 1, 5_000));
        Instant at = TestFixtures.NOW.minus(3, ChronoUnit.DAYS);
        order.transitionTo(OrderStatus.SUBMITTED, "agent-1", null, at);
        order.transitionTo(OrderStatus.VALIDATED, "cm", null, at);
        order.transitionTo(OrderStatus.PROVISIONING, "cm", null, at);
        order.transitionTo(OrderStatus.ACTIVE, "cm", null, at);
        return order;
    }

    private static CommissionEntry entry(CommissionEntry.Type type, long amount, LocalDate on) {
        return new CommissionEntry(UUID.randomUUID(), PARTNER_ID, UUID.randomUUID(), "ORD-2026-000001", type, "BASE",
                "test", amount, "GBP", on, TestFixtures.NOW, "system");
    }

    @Test
    @SuppressWarnings("unchecked")
    void accruesBaseAndNewLogoOnActivation() {
        PartnerOrder order = activeOrder(true);
        when(orders.findById(order.getId())).thenReturn(Optional.of(order));

        List<CommissionEntry> posted = service.accrueForOrder(order.getId());

        // SILVER 10% of 5,000 x 12 = 6,000 plus 25,000 new-logo bonus
        assertThat(posted).extracting(CommissionEntry::getComponent).containsExactly("BASE", "NEW_LOGO");
        assertThat(posted).extracting(CommissionEntry::getAmountMinor).containsExactly(6_000L, 25_000L);
        assertThat(posted).allSatisfy(e -> assertThat(e.getEarnedOn()).isEqualTo(LocalDate.of(2026, 11, 8)));
        verify(entries).saveAll(anyList());
    }

    @Test
    void accrualIsIdempotentPerOrder() {
        UUID orderId = UUID.randomUUID();
        when(entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)).thenReturn(true);

        assertThat(service.accrueForOrder(orderId)).isEmpty();
        verify(orders, never()).findById(any());
    }

    @Test
    void clawsBackEveryAccrualWhenCeasedInsideTheWindow() {
        UUID orderId = UUID.randomUUID();
        when(entries.findByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)).thenReturn(List.of(
                entry(CommissionEntry.Type.ACCRUAL, 6_000, LocalDate.of(2026, 10, 1)),
                entry(CommissionEntry.Type.ACCRUAL, 25_000, LocalDate.of(2026, 10, 1))));

        var reversals = service.clawbackForOrder(orderId, TestFixtures.NOW.minus(40, ChronoUnit.DAYS),
                TestFixtures.NOW, "Customer went into administration");

        assertThat(reversals).extracting(CommissionEntry::getAmountMinor).containsExactly(-6_000L, -25_000L);
        assertThat(reversals).allSatisfy(e -> assertThat(e.getType()).isEqualTo(CommissionEntry.Type.CLAWBACK));
    }

    @Test
    void keepsCommissionWhenCeasedAfterTheWindow() {
        var reversals = service.clawbackForOrder(UUID.randomUUID(), TestFixtures.NOW.minus(91, ChronoUnit.DAYS),
                TestFixtures.NOW, "Moved premises");

        assertThat(reversals).isEmpty();
        verify(entries, never()).saveAll(anyList());
    }

    @Test
    void statementSweepsUnbilledEntriesAndBringsForwardSmallBalances() {
        YearMonth october = YearMonth.of(2026, 10);
        CommissionStatement previous = new CommissionStatement(UUID.randomUUID(), "CS-2026-000000", PARTNER_ID,
                LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30), "GBP");
        previous.recalculate(List.of(entry(CommissionEntry.Type.ACCRUAL, 3_000, LocalDate.of(2026, 9, 3))), 0);
        previous.issue(TestFixtures.NOW);
        previous.decide(StatementStatus.CARRIED_FORWARD, "cm", TestFixtures.NOW);
        List<CommissionEntry> unbilled = List.of(
                entry(CommissionEntry.Type.ACCRUAL, 40_000, LocalDate.of(2026, 10, 5)),
                entry(CommissionEntry.Type.CLAWBACK, -6_000, LocalDate.of(2026, 10, 20)));
        when(entries.findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(PARTNER_ID, october.atEndOfMonth()))
                .thenReturn(unbilled);
        when(statements.findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(PARTNER_ID,
                StatementStatus.CARRIED_FORWARD)).thenReturn(List.of(previous));

        CommissionStatement statement = service.generateStatement(PARTNER_ID, october).orElseThrow();

        assertThat(statement.getAccruedMinor()).isEqualTo(40_000);
        assertThat(statement.getClawbackMinor()).isEqualTo(-6_000);
        assertThat(statement.getBroughtForwardMinor()).isEqualTo(3_000);
        assertThat(statement.getNetPayableMinor()).isEqualTo(37_000);
        assertThat(previous.getCarriedIntoStatementId()).isEqualTo(statement.getId());
        assertThat(unbilled).allSatisfy(e -> assertThat(e.getStatementId()).isEqualTo(statement.getId()));
    }

    @Test
    void refusesToBillTheCurrentMonth() {
        assertThatThrownBy(() -> service.generateStatement(PARTNER_ID, YearMonth.of(2026, 11)))
                .hasMessageContaining("closed months");
    }

    @Test
    void approvalSchedulesPayoutOrCarriesForwardBelowMinimum() {
        CommissionStatement big = issuedStatement(40_000);
        CommissionStatement small = issuedStatement(4_999);

        service.approve(big.getId(), TestFixtures.manager("cm-1"));
        service.approve(small.getId(), TestFixtures.manager("cm-1"));

        ArgumentCaptor<CommissionPayout> payout = ArgumentCaptor.forClass(CommissionPayout.class);
        verify(payouts).save(payout.capture());
        assertThat(payout.getValue().getAmountMinor()).isEqualTo(40_000);
        assertThat(payout.getValue().getScheduledFor()).isEqualTo(LocalDate.of(2026, 12, 11));
        assertThat(big.getStatus()).isEqualTo(StatementStatus.APPROVED);
        assertThat(small.getStatus()).isEqualTo(StatementStatus.CARRIED_FORWARD);
    }

    @Test
    void partnersCanOnlyDisputeWithinTheWindow() {
        CommissionStatement fresh = issuedStatement(10_000);
        CommissionStatement stale = new CommissionStatement(UUID.randomUUID(), "CS-OLD", PARTNER_ID,
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), "GBP");
        stale.issue(TestFixtures.NOW.minus(31, ChronoUnit.DAYS));
        when(statements.findById(stale.getId())).thenReturn(Optional.of(stale));

        service.dispute(fresh.getId(), "Missing order ORD-2026-000004", TestFixtures.admin(PARTNER_ID));

        assertThat(fresh.getStatus()).isEqualTo(StatementStatus.DISPUTED);
        assertThatThrownBy(() -> service.dispute(stale.getId(), "late", TestFixtures.admin(PARTNER_ID)))
                .isInstanceOf(PortalException.BusinessRule.class);
    }

    private CommissionStatement issuedStatement(long net) {
        CommissionStatement s = new CommissionStatement(UUID.randomUUID(), "CS-" + net, PARTNER_ID,
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), "GBP");
        s.recalculate(List.of(entry(CommissionEntry.Type.ACCRUAL, net, LocalDate.of(2026, 10, 2))), 0);
        s.issue(TestFixtures.NOW);
        when(statements.findById(s.getId())).thenReturn(Optional.of(s));
        return s;
    }
}

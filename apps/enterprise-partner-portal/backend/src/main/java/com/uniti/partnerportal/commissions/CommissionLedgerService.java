package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.orders.OrderEvents;
import com.uniti.partnerportal.orders.OrderSite;
import com.uniti.partnerportal.orders.PartnerOrder;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Commission ledger postings driven by order lifecycle events.
 * <ul>
 *   <li>Accruals are posted when an order goes live (after the order transaction commits, so a
 *       commission fault can never undo an activation). Posting is idempotent per order.</li>
 *   <li>If the customer terminates within the clawback window, every accrual for that order is
 *       reversed in full.</li>
 * </ul>
 */
@Service
@Transactional
public class CommissionLedgerService {

    private static final Logger log = LoggerFactory.getLogger(CommissionLedgerService.class);

    private final CommissionRuleRepository rules;
    private final CommissionEntryRepository entries;
    private final PartnerOrderRepository orders;
    private final PartnerService partners;
    private final CommissionCalculator calculator;
    private final PortalProperties properties;
    private final Clock clock;

    public CommissionLedgerService(CommissionRuleRepository rules, CommissionEntryRepository entries,
                                   PartnerOrderRepository orders, PartnerService partners,
                                   CommissionCalculator calculator, PortalProperties properties, Clock clock) {
        this.rules = rules;
        this.entries = entries;
        this.orders = orders;
        this.partners = partners;
        this.calculator = calculator;
        this.properties = properties;
        this.clock = clock;
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderActivated(OrderEvents.OrderActivated event) {
        accrueForOrder(event.orderId());
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderCeased(OrderEvents.OrderCeased event) {
        clawbackForOrder(event.orderId(), event.activatedAt(), event.ceasedAt(), event.reason());
    }

    public List<CommissionEntry> accrueForOrder(UUID orderId) {
        if (entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)) {
            log.info("commission_accrual_skipped orderId={} reason=already_accrued", orderId);
            return List.of();
        }
        PartnerOrder order = orders.findById(orderId).orElseThrow(() -> new PortalException.NotFound("Order", orderId));
        if (order.getActivatedAt() == null) {
            throw new PortalException.BusinessRule("commission.order_not_active",
                    "Order " + order.getReference() + " has not gone live");
        }
        Partner partner = partners.load(order.getPartnerId());
        LocalDate earnedOn = order.getActivatedAt().atZone(ZoneOffset.UTC).toLocalDate();
        CommissionCalculator.OrderBasis basis = toBasis(order);
        CommissionCalculator.Result result = calculator.calculate(basis, partner.getTier(),
                rules.findEffectiveOn(earnedOn), properties.commissions());
        Instant now = Instant.now(clock);
        List<CommissionEntry> posted = new ArrayList<>();
        for (CommissionCalculator.Line line : result.lines()) {
            posted.add(new CommissionEntry(UUID.randomUUID(), order.getPartnerId(), order.getId(),
                    order.getReference(), CommissionEntry.Type.ACCRUAL, line.component(), line.description(),
                    line.amount().amountMinor(), line.amount().currency(), earnedOn, now, CommissionService.SYSTEM));
        }
        entries.saveAll(posted);
        log.info("commission_accrued orderRef={} partnerId={} total={}", order.getReference(), order.getPartnerId(),
                result.total());
        return posted;
    }

    /**
     * Reverses every accrual for the order when it ceased inside the clawback window. Termination
     * outside the window keeps the commission.
     */
    public List<CommissionEntry> clawbackForOrder(UUID orderId, Instant activatedAt, Instant ceasedAt, String reason) {
        long liveDays = ChronoUnit.DAYS.between(activatedAt, ceasedAt);
        if (liveDays > properties.commissions().clawbackWindowDays()) {
            log.info("commission_clawback_skipped orderId={} liveDays={}", orderId, liveDays);
            return List.of();
        }
        if (entries.existsByOrderIdAndType(orderId, CommissionEntry.Type.CLAWBACK)) {
            return List.of();
        }
        LocalDate on = ceasedAt.atZone(ZoneOffset.UTC).toLocalDate();
        Instant now = Instant.now(clock);
        List<CommissionEntry> reversals = new ArrayList<>();
        for (CommissionEntry a : entries.findByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL)) {
            reversals.add(new CommissionEntry(UUID.randomUUID(), a.getPartnerId(), a.getOrderId(),
                    a.getOrderReference(), CommissionEntry.Type.CLAWBACK, a.getComponent(),
                    "Clawback after " + liveDays + " days live: " + reason, -a.getAmountMinor(),
                    a.getCurrency(), on, now, CommissionService.SYSTEM));
        }
        entries.saveAll(reversals);
        log.info("commission_clawed_back orderId={} entries={}", orderId, reversals.size());
        return reversals;
    }

    private static CommissionCalculator.OrderBasis toBasis(PartnerOrder order) {
        List<CommissionCalculator.SiteBasis> sites = new ArrayList<>();
        for (OrderSite s : order.getSites()) {
            sites.add(new CommissionCalculator.SiteBasis(s.getProductCategory(), s.getNetMrcMinor()));
        }
        return new CommissionCalculator.OrderBasis(order.getCurrency(), order.getTermMonths(),
                order.getDealId() != null, order.isNewLogo(), sites);
    }
}

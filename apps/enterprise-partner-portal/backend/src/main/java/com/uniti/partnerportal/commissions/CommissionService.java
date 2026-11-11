package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionSummaryResponse;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.orders.OrderEvents;
import com.uniti.partnerportal.orders.PartnerOrder;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Commission ledger, monthly statements and payouts.
 * <ul>
 *   <li>Accruals are posted when an order goes live (after the order transaction commits, so a
 *       commission fault can never undo an activation). Posting is idempotent per order.</li>
 *   <li>If the customer terminates within the clawback window, every accrual for that order is
 *       reversed in full.</li>
 *   <li>Each month every unbilled entry is swept onto a statement. Partners may dispute an issued
 *       statement within {@value #DISPUTE_WINDOW_DAYS} days; channel managers resolve disputes
 *       with adjustment entries.</li>
 *   <li>Approved statements below {@value #MIN_PAYOUT_MINOR} minor units (or negative) are
 *       carried forward into the next statement instead of paid.</li>
 * </ul>
 */
@Service
@Transactional
public class CommissionService {

    private static final Logger log = LoggerFactory.getLogger(CommissionService.class);
    static final long MIN_PAYOUT_MINOR = 5_000L;
    static final int DISPUTE_WINDOW_DAYS = 30;
    static final int PAYMENT_TERMS_DAYS = 30;
    static final String SYSTEM = "system";

    private final CommissionRuleRepository rules;
    private final CommissionEntryRepository entries;
    private final CommissionStatementRepository statements;
    private final CommissionPayoutRepository payouts;
    private final PartnerOrderRepository orders;
    private final PartnerService partners;
    private final CommissionCalculator calculator;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public CommissionService(CommissionRuleRepository rules, CommissionEntryRepository entries,
                             CommissionStatementRepository statements, CommissionPayoutRepository payouts,
                             PartnerOrderRepository orders, PartnerService partners, CommissionCalculator calculator,
                             ReferenceGenerator references, PortalProperties properties, Clock clock) {
        this.rules = rules;
        this.entries = entries;
        this.statements = statements;
        this.payouts = payouts;
        this.orders = orders;
        this.partners = partners;
        this.calculator = calculator;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- ledger

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
        var basis = new CommissionCalculator.OrderBasis(order.getCurrency(), order.getTermMonths(),
                order.getDealId() != null, order.isNewLogo(),
                order.getSites().stream()
                        .map(s -> new CommissionCalculator.SiteBasis(s.getProductCategory(), s.getNetMrcMinor()))
                        .toList());
        var result = calculator.calculate(basis, partner.getTier(), rules.findEffectiveOn(earnedOn),
                properties.commissions());
        Instant now = Instant.now(clock);
        List<CommissionEntry> posted = result.lines().stream()
                .map(line -> new CommissionEntry(UUID.randomUUID(), order.getPartnerId(), order.getId(),
                        order.getReference(), CommissionEntry.Type.ACCRUAL, line.component(), line.description(),
                        line.amount().amountMinor(), line.amount().currency(), earnedOn, now, SYSTEM))
                .toList();
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
        List<CommissionEntry> reversals = entries.findByOrderIdAndType(orderId, CommissionEntry.Type.ACCRUAL).stream()
                .map(a -> new CommissionEntry(UUID.randomUUID(), a.getPartnerId(), a.getOrderId(),
                        a.getOrderReference(), CommissionEntry.Type.CLAWBACK, a.getComponent(),
                        "Clawback after " + liveDays + " days live: " + reason, -a.getAmountMinor(),
                        a.getCurrency(), on, now, SYSTEM))
                .toList();
        entries.saveAll(reversals);
        log.info("commission_clawed_back orderId={} entries={}", orderId, reversals.size());
        return reversals;
    }

    // ---------------------------------------------------------------- statements

    /**
     * Sweeps all unbilled entries earned up to the end of {@code period} onto a new statement,
     * bringing in any carried-forward balance. Returns empty when there is nothing to bill.
     */
    public Optional<CommissionStatement> generateStatement(UUID partnerId, YearMonth period) {
        if (!period.isBefore(YearMonth.now(clock))) {
            throw new PortalException.BusinessRule("commission.period_open",
                    "Statements can only be generated for closed months");
        }
        LocalDate start = period.atDay(1);
        if (statements.existsByPartnerIdAndPeriodStart(partnerId, start)) {
            throw new PortalException.Conflict("commission.statement_exists",
                    "A statement already exists for " + period);
        }
        Partner partner = partners.load(partnerId);
        LocalDate end = period.atEndOfMonth();
        List<CommissionEntry> unbilled = entries.findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(
                partnerId, end);
        List<CommissionStatement> carried = statements.findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(
                partnerId, StatementStatus.CARRIED_FORWARD);
        if (unbilled.isEmpty() && carried.isEmpty()) {
            return Optional.empty();
        }
        CommissionStatement statement = new CommissionStatement(UUID.randomUUID(),
                references.next(ReferenceGenerator.Kind.STATEMENT), partnerId, start, end, partner.getCurrency());
        long broughtForward = 0;
        for (CommissionStatement previous : carried) {
            broughtForward = Math.addExact(broughtForward, previous.getNetPayableMinor());
            previous.carryInto(statement.getId());
        }
        unbilled.forEach(e -> e.assignTo(statement.getId()));
        statement.recalculate(unbilled, broughtForward);
        return Optional.of(statements.save(statement));
    }

    /**
     * Runs on the 2nd of each month: bills the previous month for every partner with activity
     * and issues the statements so partners can review them.
     */
    @Scheduled(cron = "0 0 2 2 * *", zone = "UTC")
    public void runMonthlyStatementCycle() {
        YearMonth period = YearMonth.now(clock).minusMonths(1);
        Instant now = Instant.now(clock);
        for (UUID partnerId : entries.findPartnersWithUnbilledEntries(period.atEndOfMonth())) {
            try {
                if (!statements.existsByPartnerIdAndPeriodStart(partnerId, period.atDay(1))) {
                    generateStatement(partnerId, period).ifPresent(s -> s.issue(now));
                }
            } catch (RuntimeException ex) {
                log.error("commission_statement_failed partnerId={} period={}", partnerId, period, ex);
            }
        }
    }

    public CommissionStatement issue(UUID statementId) {
        CommissionStatement statement = load(statementId);
        statement.issue(Instant.now(clock));
        return statement;
    }

    public CommissionStatement dispute(UUID statementId, String reason, CurrentUser user) {
        CommissionStatement statement = getStatement(statementId, user);
        if (!isDisputable(statement)) {
            throw new PortalException.BusinessRule("commission.dispute_window_closed",
                    "Statements can be disputed within " + DISPUTE_WINDOW_DAYS + " days of issue");
        }
        statement.dispute(reason.trim(), Instant.now(clock));
        log.info("commission_statement_disputed statementRef={} by={}", statement.getReference(), user.subject());
        return statement;
    }

    public CommissionStatement adjust(UUID statementId, long amountMinor, String description, CurrentUser manager) {
        CommissionStatement statement = load(statementId);
        if (!statement.getStatus().acceptsAdjustments()) {
            throw new PortalException.BusinessRule("commission.not_adjustable",
                    "Only draft or disputed statements can be adjusted");
        }
        LocalDate on = LocalDate.now(clock);
        CommissionEntry adjustment = new CommissionEntry(UUID.randomUUID(), statement.getPartnerId(), null, null,
                CommissionEntry.Type.ADJUSTMENT, "ADJUSTMENT", description.trim(), amountMinor,
                statement.getCurrency(), on.isAfter(statement.getPeriodEnd()) ? statement.getPeriodEnd() : on,
                Instant.now(clock), manager.subject());
        adjustment.assignTo(statement.getId());
        entries.save(adjustment);
        List<CommissionEntry> all = new ArrayList<>(entries.findByStatementIdOrderByEarnedOnAscCreatedAtAsc(
                statement.getId()));
        if (all.stream().noneMatch(e -> e.getId().equals(adjustment.getId()))) {
            all.add(adjustment);
        }
        statement.recalculate(all, statement.getBroughtForwardMinor());
        return statement;
    }

    public CommissionStatement reissue(UUID statementId) {
        CommissionStatement statement = load(statementId);
        if (statement.getStatus() != StatementStatus.DISPUTED) {
            throw new PortalException.BusinessRule("commission.not_disputed", "Only disputed statements are reissued");
        }
        statement.issue(Instant.now(clock));
        return statement;
    }

    /**
     * Approves an issued statement for payment. Small or negative balances are carried forward
     * rather than paid; anything else schedules a payout on standard payment terms.
     */
    public CommissionStatement approve(UUID statementId, CurrentUser manager) {
        CommissionStatement statement = load(statementId);
        Instant now = Instant.now(clock);
        if (statement.getNetPayableMinor() < MIN_PAYOUT_MINOR) {
            statement.decide(StatementStatus.CARRIED_FORWARD, manager.subject(), now);
            return statement;
        }
        statement.decide(StatementStatus.APPROVED, manager.subject(), now);
        payouts.save(new CommissionPayout(UUID.randomUUID(), statement.getId(), statement.getPartnerId(),
                statement.getNetPayableMinor(), statement.getCurrency(),
                LocalDate.now(clock).plusDays(PAYMENT_TERMS_DAYS)));
        return statement;
    }

    public CommissionPayout markPayoutPaid(UUID payoutId, String paymentReference) {
        CommissionPayout payout = loadPayout(payoutId);
        Instant now = Instant.now(clock);
        payout.markPaid(paymentReference.trim(), now);
        load(payout.getStatementId()).markPaid(now);
        return payout;
    }

    public CommissionPayout markPayoutFailed(UUID payoutId, String reason) {
        CommissionPayout payout = loadPayout(payoutId);
        payout.markFailed(reason);
        log.warn("commission_payout_failed payoutId={} partnerId={}", payoutId, payout.getPartnerId());
        return payout;
    }

    public CommissionPayout reschedulePayout(UUID payoutId) {
        CommissionPayout payout = loadPayout(payoutId);
        payout.reschedule(LocalDate.now(clock).plusDays(1));
        return payout;
    }

    // ---------------------------------------------------------------- queries

    @Transactional(readOnly = true)
    public Page<CommissionStatement> searchStatements(UUID partnerId, StatementStatus status, Pageable pageable,
                                                      CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        return statements.search(scope, status, pageable);
    }

    @Transactional(readOnly = true)
    public CommissionStatement getStatement(UUID statementId, CurrentUser user) {
        CommissionStatement statement = load(statementId);
        user.assertCanAccess(statement.getPartnerId());
        return statement;
    }

    @Transactional(readOnly = true)
    public List<CommissionEntry> statementEntries(UUID statementId) {
        return entries.findByStatementIdOrderByEarnedOnAscCreatedAtAsc(statementId);
    }

    @Transactional(readOnly = true)
    public Optional<CommissionPayout> statementPayout(UUID statementId) {
        return payouts.findByStatementId(statementId);
    }

    @Transactional(readOnly = true)
    public Page<CommissionPayout> searchPayouts(UUID partnerId, CommissionPayout.Status status, Pageable pageable,
                                                CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        return payouts.search(scope, status, pageable);
    }

    @Transactional(readOnly = true)
    public CommissionSummaryResponse summary(UUID requestedPartner, CurrentUser user) {
        UUID partnerId = user.effectivePartner(requestedPartner);
        Partner partner = partners.load(partnerId);
        LocalDate today = LocalDate.now(clock);
        LocalDate yearStart = Year.from(today).atDay(1);
        return new CommissionSummaryResponse(partner.getCurrency(), partner.getTier(),
                partner.getTier().commissionRateBps(),
                entries.sumEarned(partnerId, yearStart, today),
                entries.sumUnbilled(partnerId),
                payouts.sumPaidSince(partnerId, yearStart.atStartOfDay(ZoneOffset.UTC).toInstant()),
                payouts.sumOutstanding(partnerId));
    }

    public boolean isDisputable(CommissionStatement statement) {
        return statement.getStatus() == StatementStatus.ISSUED && statement.getIssuedAt() != null
                && !statement.getIssuedAt().plus(DISPUTE_WINDOW_DAYS, ChronoUnit.DAYS).isBefore(Instant.now(clock));
    }

    // ---------------------------------------------------------------- rules

    @Transactional(readOnly = true)
    public Page<CommissionRule> listRules(boolean active, Pageable pageable) {
        return rules.findByActive(active, pageable);
    }

    public CommissionRule createRule(CommissionRuleRequest request) {
        if (request.validTo() != null && request.validTo().isBefore(LocalDate.now(clock))) {
            throw new PortalException.BusinessRule("commission.rule_in_past", "A rule cannot end in the past");
        }
        return rules.save(new CommissionRule(UUID.randomUUID(), request.name().trim(), request.productCategory(),
                request.minTier(), request.minTermMonths(), request.rateBps(), request.flatBonusMinor(),
                properties.pricing().defaultCurrency(), request.validFrom(), request.validTo()));
    }

    public CommissionRule deactivateRule(UUID ruleId) {
        CommissionRule rule = rules.findById(ruleId)
                .orElseThrow(() -> new PortalException.NotFound("CommissionRule", ruleId));
        rule.deactivate();
        return rule;
    }

    private CommissionStatement load(UUID statementId) {
        return statements.findById(statementId)
                .orElseThrow(() -> new PortalException.NotFound("CommissionStatement", statementId));
    }

    private CommissionPayout loadPayout(UUID payoutId) {
        return payouts.findById(payoutId).orElseThrow(() -> new PortalException.NotFound("CommissionPayout", payoutId));
    }
}

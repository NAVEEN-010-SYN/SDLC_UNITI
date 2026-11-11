package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationRepository;
import com.uniti.partnerportal.deals.DealStatus;
import com.uniti.partnerportal.leads.Lead;
import com.uniti.partnerportal.leads.LeadRepository;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.orders.PartnerOrderRepository;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.QuoteRepository;
import com.uniti.partnerportal.quotes.QuoteStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;

/**
 * Aggregates pipeline KPIs across leads, deal registrations, quotes and orders. All figures are
 * computed in the database; nothing here loads individual records.
 */
@Service
@Transactional(readOnly = true)
public class DashboardService {

    static final int MAX_WINDOW_DAYS = 730;

    private final LeadRepository leads;
    private final DealRegistrationRepository deals;
    private final QuoteRepository quotes;
    private final PartnerOrderRepository orders;
    private final PartnerService partners;
    private final Clock clock;

    public DashboardService(LeadRepository leads, DealRegistrationRepository deals, QuoteRepository quotes,
                            PartnerOrderRepository orders, PartnerService partners, Clock clock) {
        this.leads = leads;
        this.deals = deals;
        this.quotes = quotes;
        this.orders = orders;
        this.partners = partners;
        this.clock = clock;
    }

    public PipelineKpis pipeline(UUID requestedPartner, int windowDays, CurrentUser user) {
        if (windowDays < 1 || windowDays > MAX_WINDOW_DAYS) {
            throw new PortalException.BusinessRule("dashboard.invalid_window",
                    "The window must be between 1 and " + MAX_WINDOW_DAYS + " days");
        }
        UUID partnerId = user.effectivePartner(requestedPartner);
        Partner partner = partners.load(partnerId);
        Instant since = Instant.now(clock).minus(windowDays, ChronoUnit.DAYS);

        Map<Lead.Status, Long> leadCounts = new EnumMap<>(Lead.Status.class);
        for (Lead.Status status : Lead.Status.values()) {
            leadCounts.put(status, leads.countByPartnerIdAndStatus(partnerId, status));
        }

        Map<DealStatus, PipelineKpis.StageTotal> dealTotals = new EnumMap<>(DealStatus.class);
        deals.rollupByStatus(partnerId, since).forEach(r ->
                dealTotals.put(r.getStatus(), new PipelineKpis.StageTotal(r.getCount(), r.getMrc())));
        long openPipeline = 0;
        for (DealStatus status : DealStatus.CLAIMING) {
            PipelineKpis.StageTotal total = dealTotals.get(status);
            if (total != null) {
                openPipeline += total.mrcMinor();
            }
        }

        Map<QuoteStatus, Long> quoteCounts = new EnumMap<>(QuoteStatus.class);
        for (QuoteStatus status : QuoteStatus.values()) {
            long count = quotes.countByPartnerIdAndStatusInAndCreatedAtAfter(partnerId, EnumSet.of(status), since);
            if (count > 0) {
                quoteCounts.put(status, count);
            }
        }

        Map<OrderStatus, PipelineKpis.StageTotal> orderTotals = new EnumMap<>(OrderStatus.class);
        orders.rollupByStatus(partnerId, since).forEach(r ->
                orderTotals.put(r.getStatus(), new PipelineKpis.StageTotal(r.getCount(), r.getMrc())));
        long inFlight = 0;
        for (OrderStatus status : OrderStatus.IN_FLIGHT) {
            PipelineKpis.StageTotal total = orderTotals.get(status);
            if (total != null) {
                inFlight += total.count();
            }
        }

        return new PipelineKpis(
                partner.getCurrency(),
                since,
                leadCounts,
                leads.countByPartnerIdAndCreatedAtAfter(partnerId, since),
                PipelineKpis.rate(leadCounts.get(Lead.Status.CONVERTED), leadCounts.get(Lead.Status.DISQUALIFIED)),
                dealTotals,
                openPipeline,
                PipelineKpis.rate(count(dealTotals, DealStatus.WON), count(dealTotals, DealStatus.LOST)),
                quoteCounts,
                PipelineKpis.rate(
                        quoteCounts.getOrDefault(QuoteStatus.ACCEPTED, 0L) + quoteCounts.getOrDefault(QuoteStatus.ORDERED, 0L),
                        quoteCounts.getOrDefault(QuoteStatus.DECLINED, 0L) + quoteCounts.getOrDefault(QuoteStatus.EXPIRED, 0L)),
                orderTotals,
                inFlight,
                orders.sumActivatedMonthlyRecurring(partnerId, since));
    }

    private static long count(Map<DealStatus, PipelineKpis.StageTotal> totals, DealStatus status) {
        PipelineKpis.StageTotal total = totals.get(status);
        return total == null ? 0 : total.count();
    }
}

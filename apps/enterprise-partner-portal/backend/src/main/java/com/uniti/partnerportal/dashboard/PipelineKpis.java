package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.deals.DealStatus;
import com.uniti.partnerportal.leads.Lead;
import com.uniti.partnerportal.orders.OrderStatus;
import com.uniti.partnerportal.quotes.QuoteStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;

/**
 * Pipeline health for one partner over a trailing window. Rates are percentages with one decimal
 * place and are {@code null} when there is no closed population to measure yet (so the UI can
 * show "n/a" rather than a misleading 0%).
 */
public record PipelineKpis(
        String currency,
        Instant windowStart,
        Map<Lead.Status, Long> leadsByStatus,
        long newLeads,
        BigDecimal leadConversionRate,
        Map<DealStatus, StageTotal> dealsByStatus,
        long openPipelineMrcMinor,
        BigDecimal dealWinRate,
        Map<QuoteStatus, Long> quotesByStatus,
        BigDecimal quoteAcceptanceRate,
        Map<OrderStatus, StageTotal> ordersByStatus,
        long ordersInFlight,
        long activatedMrcMinor) {

    public record StageTotal(long count, long mrcMinor) {
    }

    /**
     * {@code wins / (wins + losses)} as a percentage, or null when nothing has closed.
     */
    static BigDecimal rate(long wins, long losses) {
        long closed = wins + losses;
        if (closed == 0) {
            return null;
        }
        return BigDecimal.valueOf(wins * 100L).divide(BigDecimal.valueOf(closed), 1, RoundingMode.HALF_EVEN);
    }
}

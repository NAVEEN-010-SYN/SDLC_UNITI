package com.uniti.partnerportal.orders;

import java.time.Instant;
import java.util.UUID;

/**
 * Domain events published by the orders module. Commissions listens to these rather than the
 * order service calling it directly, so fulfilment never depends on the payout ledger.
 */
public final class OrderEvents {

    private OrderEvents() {
    }

    public record OrderActivated(UUID orderId, UUID partnerId, Instant activatedAt) {
    }

    public record OrderCeased(UUID orderId, UUID partnerId, Instant activatedAt, Instant ceasedAt, String reason) {
    }
}

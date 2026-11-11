package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.domain.StateMachine;

import java.util.EnumSet;
import java.util.Set;

/**
 * Platform order lifecycle.
 * <pre>
 * DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE
 *   |          |            |              |
 *   +----------+------------+--> CANCELLED +--> FAILED -> SUBMITTED (resubmit)
 * </pre>
 * Orders can be cancelled freely until provisioning starts; after that only the provisioning
 * outcome (ACTIVE or FAILED) can close them.
 */
public enum OrderStatus {
    DRAFT,
    SUBMITTED,
    VALIDATED,
    PROVISIONING,
    ACTIVE,
    CANCELLED,
    FAILED;

    public static final StateMachine<OrderStatus> LIFECYCLE = StateMachine
            .builder("Order", OrderStatus.class)
            .allow(DRAFT, SUBMITTED, CANCELLED)
            .allow(SUBMITTED, VALIDATED, FAILED, CANCELLED)
            .allow(VALIDATED, PROVISIONING, CANCELLED)
            .allow(PROVISIONING, ACTIVE, FAILED)
            .allow(FAILED, SUBMITTED, CANCELLED)
            .build();

    /** Orders still moving through fulfilment, shown as "in flight" on the dashboard. */
    public static final Set<OrderStatus> IN_FLIGHT = EnumSet.of(SUBMITTED, VALIDATED, PROVISIONING);
}

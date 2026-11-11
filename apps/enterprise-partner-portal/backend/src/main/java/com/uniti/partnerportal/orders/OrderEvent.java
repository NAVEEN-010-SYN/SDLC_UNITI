package com.uniti.partnerportal.orders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/** Append-only timeline entry shown to the partner as the order tracking history. */
@Entity
@Table(name = "order_event")
public class OrderEvent {

    public enum Type { STATUS_CHANGED, SITE_UPDATED, NOTE }

    static final int MAX_DETAIL = 500;

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private PartnerOrder order;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    @Column(nullable = false, length = 120)
    private String actor;

    @Column(nullable = false, length = MAX_DETAIL)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected OrderEvent() {
    }

    OrderEvent(UUID id, Type type, String actor, String detail, Instant occurredAt) {
        this.id = id;
        this.type = type;
        this.actor = actor;
        this.detail = detail.length() > MAX_DETAIL ? detail.substring(0, MAX_DETAIL) : detail;
        this.occurredAt = occurredAt;
    }

    void setOrder(PartnerOrder order) {
        this.order = order;
    }

    public UUID getId() {
        return id;
    }

    public Type getType() {
        return type;
    }

    public String getActor() {
        return actor;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}

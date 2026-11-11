package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * An order placed by a partner on behalf of a customer, created from an accepted quote. Pricing
 * is copied from the quote so the order is the commercial record even if the quote is later
 * archived; per-site fulfilment is tracked on {@link OrderSite}.
 */
@Entity
@Table(name = "partner_order")
public class PartnerOrder extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "quote_id", nullable = false, unique = true)
    private UUID quoteId;

    @Column(name = "quote_reference", nullable = false, length = 20)
    private String quoteReference;

    @Column(name = "deal_id")
    private UUID dealId;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Column(name = "customer_account_id", nullable = false, length = 12)
    private String customerAccountId;

    @Column(name = "new_logo", nullable = false)
    private boolean newLogo;

    @Column(name = "customer_contact_email", nullable = false, length = 200)
    private String customerContactEmail;

    @Column(name = "purchase_order_number", length = 40)
    private String purchaseOrderNumber;

    @Column(name = "term_months", nullable = false)
    private int termMonths;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "monthly_recurring_minor", nullable = false)
    private long monthlyRecurringMinor;

    @Column(name = "one_off_minor", nullable = false)
    private long oneOffMinor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Column(name = "requested_by", nullable = false, length = 120)
    private String requestedBy;

    @Column(name = "requested_install_date")
    private LocalDate requestedInstallDate;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "ceased_at")
    private Instant ceasedAt;

    @Column(name = "status_reason", length = 500)
    private String statusReason;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("siteNo")
    private List<OrderSite> sites = new ArrayList<>();

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("occurredAt")
    private List<OrderEvent> events = new ArrayList<>();

    protected PartnerOrder() {
    }

    public PartnerOrder(UUID id, String reference, UUID partnerId, UUID quoteId, String quoteReference,
                        String currency, String requestedBy) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.quoteId = quoteId;
        this.quoteReference = quoteReference;
        this.currency = currency;
        this.requestedBy = requestedBy;
        this.status = OrderStatus.DRAFT;
    }

    /**
     * Moves the order and appends a timeline entry in one step so the history can never drift
     * from the status.
     */
    public void transitionTo(OrderStatus next, String actor, String detail, Instant at) {
        OrderStatus.LIFECYCLE.assertTransition(status, next);
        OrderStatus previous = status;
        this.status = next;
        this.statusReason = detail;
        if (next == OrderStatus.SUBMITTED) {
            submittedAt = at;
        } else if (next == OrderStatus.ACTIVE) {
            activatedAt = at;
        }
        String suffix = detail == null || detail.isBlank() ? "" : ": " + detail;
        record(OrderEvent.Type.STATUS_CHANGED, actor, previous + " -> " + next + suffix, at);
    }

    public void addSite(OrderSite site) {
        site.setOrder(this);
        sites.add(site);
    }

    public void record(OrderEvent.Type type, String actor, String detail, Instant at) {
        OrderEvent event = new OrderEvent(UUID.randomUUID(), type, actor, detail, at);
        event.setOrder(this);
        events.add(event);
    }

    public boolean allSitesLive() {
        return !sites.isEmpty() && sites.stream().allMatch(s -> s.getStage() == ProvisioningStage.LIVE);
    }

    public void markCeased(Instant at, String reason) {
        this.ceasedAt = at;
        this.statusReason = reason;
    }

    public UUID getId() {
        return id;
    }

    public String getReference() {
        return reference;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public UUID getQuoteId() {
        return quoteId;
    }

    public String getQuoteReference() {
        return quoteReference;
    }

    public UUID getDealId() {
        return dealId;
    }

    public void setDealId(UUID dealId) {
        this.dealId = dealId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerAccountId() {
        return customerAccountId;
    }

    public boolean isNewLogo() {
        return newLogo;
    }

    public void assignAccount(String customerAccountId, boolean newLogo) {
        this.customerAccountId = customerAccountId;
        this.newLogo = newLogo;
    }

    public String getCustomerContactEmail() {
        return customerContactEmail;
    }

    public void setCustomerContactEmail(String customerContactEmail) {
        this.customerContactEmail = customerContactEmail;
    }

    public String getPurchaseOrderNumber() {
        return purchaseOrderNumber;
    }

    public void setPurchaseOrderNumber(String purchaseOrderNumber) {
        this.purchaseOrderNumber = purchaseOrderNumber;
    }

    public int getTermMonths() {
        return termMonths;
    }

    public void setTermMonths(int termMonths) {
        this.termMonths = termMonths;
    }

    public String getCurrency() {
        return currency;
    }

    public long getMonthlyRecurringMinor() {
        return monthlyRecurringMinor;
    }

    public long getOneOffMinor() {
        return oneOffMinor;
    }

    public void setCharges(long monthlyRecurringMinor, long oneOffMinor) {
        this.monthlyRecurringMinor = monthlyRecurringMinor;
        this.oneOffMinor = oneOffMinor;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public LocalDate getRequestedInstallDate() {
        return requestedInstallDate;
    }

    public void setRequestedInstallDate(LocalDate requestedInstallDate) {
        this.requestedInstallDate = requestedInstallDate;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getActivatedAt() {
        return activatedAt;
    }

    public Instant getCeasedAt() {
        return ceasedAt;
    }

    public String getStatusReason() {
        return statusReason;
    }

    public List<OrderSite> getSites() {
        return sites;
    }

    public List<OrderEvent> getEvents() {
        return events;
    }
}

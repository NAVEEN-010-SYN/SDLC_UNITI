package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.catalog.CatalogProduct;
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
import java.time.LocalDate;
import java.util.UUID;

/**
 * One product delivered at one customer site. The product category is snapshotted so commission
 * rules that target a category keep working if the catalog is reorganised.
 */
@Entity
@Table(name = "order_site")
public class OrderSite {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private PartnerOrder order;

    @Column(name = "site_no", nullable = false)
    private int siteNo;

    @Column(name = "site_name", nullable = false, length = 120)
    private String siteName;

    @Column(name = "site_postcode", nullable = false, length = 10)
    private String sitePostcode;

    @Column(nullable = false, length = 40)
    private String sku;

    @Column(name = "product_name", nullable = false, length = 120)
    private String productName;

    @Enumerated(EnumType.STRING)
    @Column(name = "product_category", nullable = false, length = 20)
    private CatalogProduct.Category productCategory;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "net_mrc_minor", nullable = false)
    private long netMrcMinor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProvisioningStage stage;

    @Enumerated(EnumType.STRING)
    @Column(name = "blocked_from_stage", length = 20)
    private ProvisioningStage blockedFromStage;

    @Column(name = "engineer_visit_date")
    private LocalDate engineerVisitDate;

    @Column(name = "service_id", length = 40)
    private String serviceId;

    @Column(name = "stage_updated_at")
    private Instant stageUpdatedAt;

    @Column(name = "blocker_note", length = 500)
    private String blockerNote;

    protected OrderSite() {
    }

    public OrderSite(UUID id, int siteNo, String siteName, String sitePostcode, String sku, String productName,
                     CatalogProduct.Category productCategory, int quantity, long netMrcMinor) {
        this.id = id;
        this.siteNo = siteNo;
        this.siteName = siteName;
        this.sitePostcode = sitePostcode;
        this.sku = sku;
        this.productName = productName;
        this.productCategory = productCategory;
        this.quantity = quantity;
        this.netMrcMinor = netMrcMinor;
        this.stage = ProvisioningStage.AWAITING_SURVEY;
    }

    public boolean canMoveTo(ProvisioningStage next) {
        return stage.canMoveTo(next, blockedFromStage);
    }

    /**
     * Applies a provisioning update. Blocking remembers where the site was so it cannot be
     * unblocked into an earlier stage.
     */
    public void moveTo(ProvisioningStage next, String note, Instant at) {
        if (!canMoveTo(next)) {
            throw new IllegalStateException("Site " + siteNo + " cannot move from " + stage + " to " + next);
        }
        if (next == ProvisioningStage.BLOCKED) {
            blockedFromStage = stage;
            blockerNote = note;
        } else {
            blockedFromStage = null;
            blockerNote = null;
        }
        this.stage = next;
        this.stageUpdatedAt = at;
    }

    void setOrder(PartnerOrder order) {
        this.order = order;
    }

    public UUID getId() {
        return id;
    }

    public int getSiteNo() {
        return siteNo;
    }

    public String getSiteName() {
        return siteName;
    }

    public String getSitePostcode() {
        return sitePostcode;
    }

    public String getSku() {
        return sku;
    }

    public String getProductName() {
        return productName;
    }

    public CatalogProduct.Category getProductCategory() {
        return productCategory;
    }

    public int getQuantity() {
        return quantity;
    }

    public long getNetMrcMinor() {
        return netMrcMinor;
    }

    public ProvisioningStage getStage() {
        return stage;
    }

    public ProvisioningStage getBlockedFromStage() {
        return blockedFromStage;
    }

    public LocalDate getEngineerVisitDate() {
        return engineerVisitDate;
    }

    public void setEngineerVisitDate(LocalDate engineerVisitDate) {
        this.engineerVisitDate = engineerVisitDate;
    }

    public String getServiceId() {
        return serviceId;
    }

    public void setServiceId(String serviceId) {
        this.serviceId = serviceId;
    }

    public Instant getStageUpdatedAt() {
        return stageUpdatedAt;
    }

    public String getBlockerNote() {
        return blockerNote;
    }
}

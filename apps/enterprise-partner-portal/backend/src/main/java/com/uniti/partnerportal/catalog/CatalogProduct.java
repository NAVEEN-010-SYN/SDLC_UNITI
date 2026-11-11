package com.uniti.partnerportal.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * A sellable product as offered to the channel. The floor price is the lowest net monthly
 * price Uniti will accept after all discounts; no approval can go below it.
 */
@Entity
@Table(name = "catalog_product")
public class CatalogProduct {

    public enum Category { BROADBAND, VOICE, SDWAN, HOSTED, ADD_ON }

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 40)
    private String sku;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Category category;

    @Column(name = "bandwidth_mbps")
    private Integer bandwidthMbps;

    @Column(name = "monthly_price_minor", nullable = false)
    private long monthlyPriceMinor;

    @Column(name = "install_price_minor", nullable = false)
    private long installPriceMinor;

    @Column(name = "floor_monthly_price_minor", nullable = false)
    private long floorMonthlyPriceMinor;

    @Column(name = "min_term_months", nullable = false)
    private int minTermMonths;

    @Column(name = "per_site", nullable = false)
    private boolean perSite;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false)
    private boolean active;

    protected CatalogProduct() {
    }

    public CatalogProduct(UUID id, String sku, String name, Category category, Integer bandwidthMbps,
                          long monthlyPriceMinor, long installPriceMinor, long floorMonthlyPriceMinor,
                          int minTermMonths, boolean perSite, String currency) {
        this.id = id;
        this.sku = sku;
        this.name = name;
        this.category = category;
        this.bandwidthMbps = bandwidthMbps;
        this.monthlyPriceMinor = monthlyPriceMinor;
        this.installPriceMinor = installPriceMinor;
        this.floorMonthlyPriceMinor = floorMonthlyPriceMinor;
        this.minTermMonths = minTermMonths;
        this.perSite = perSite;
        this.currency = currency;
        this.active = true;
    }

    public UUID getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public String getName() {
        return name;
    }

    public Category getCategory() {
        return category;
    }

    public Integer getBandwidthMbps() {
        return bandwidthMbps;
    }

    public long getMonthlyPriceMinor() {
        return monthlyPriceMinor;
    }

    public long getInstallPriceMinor() {
        return installPriceMinor;
    }

    public long getFloorMonthlyPriceMinor() {
        return floorMonthlyPriceMinor;
    }

    public int getMinTermMonths() {
        return minTermMonths;
    }

    public boolean isPerSite() {
        return perSite;
    }

    public String getCurrency() {
        return currency;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}

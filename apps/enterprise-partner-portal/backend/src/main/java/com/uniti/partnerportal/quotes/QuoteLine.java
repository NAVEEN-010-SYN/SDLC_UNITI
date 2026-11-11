package com.uniti.partnerportal.quotes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * One product at one site. Product name and prices are snapshotted from the catalog when the
 * line is added so later catalog changes never alter an issued quote.
 */
@Entity
@Table(name = "quote_line")
public class QuoteLine {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quote_id")
    private Quote quote;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(nullable = false, length = 40)
    private String sku;

    @Column(name = "product_name", nullable = false, length = 120)
    private String productName;

    @Column(name = "site_name", nullable = false, length = 120)
    private String siteName;

    @Column(name = "site_postcode", nullable = false, length = 10)
    private String sitePostcode;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_mrc_minor", nullable = false)
    private long unitMrcMinor;

    @Column(name = "unit_nrc_minor", nullable = false)
    private long unitNrcMinor;

    @Column(name = "unit_floor_mrc_minor", nullable = false)
    private long unitFloorMrcMinor;

    @Column(name = "net_mrc_minor", nullable = false)
    private long netMrcMinor;

    protected QuoteLine() {
    }

    public QuoteLine(UUID id, int lineNo, String sku, String productName, String siteName, String sitePostcode,
                     int quantity, long unitMrcMinor, long unitNrcMinor, long unitFloorMrcMinor) {
        this.id = id;
        this.lineNo = lineNo;
        this.sku = sku;
        this.productName = productName;
        this.siteName = siteName;
        this.sitePostcode = sitePostcode;
        this.quantity = quantity;
        this.unitMrcMinor = unitMrcMinor;
        this.unitNrcMinor = unitNrcMinor;
        this.unitFloorMrcMinor = unitFloorMrcMinor;
        this.netMrcMinor = unitMrcMinor * quantity;
    }

    public long listMrcMinor() {
        return unitMrcMinor * quantity;
    }

    public long nrcMinor() {
        return unitNrcMinor * quantity;
    }

    public long floorMrcMinor() {
        return unitFloorMrcMinor * quantity;
    }

    void setQuote(Quote quote) {
        this.quote = quote;
    }

    public UUID getId() {
        return id;
    }

    public Quote getQuote() {
        return quote;
    }

    public int getLineNo() {
        return lineNo;
    }

    public String getSku() {
        return sku;
    }

    public String getProductName() {
        return productName;
    }

    public String getSiteName() {
        return siteName;
    }

    public String getSitePostcode() {
        return sitePostcode;
    }

    public int getQuantity() {
        return quantity;
    }

    public long getUnitMrcMinor() {
        return unitMrcMinor;
    }

    public long getUnitNrcMinor() {
        return unitNrcMinor;
    }

    public long getUnitFloorMrcMinor() {
        return unitFloorMrcMinor;
    }

    public long getNetMrcMinor() {
        return netMrcMinor;
    }

    public void setNetMrcMinor(long netMrcMinor) {
        this.netMrcMinor = netMrcMinor;
    }
}

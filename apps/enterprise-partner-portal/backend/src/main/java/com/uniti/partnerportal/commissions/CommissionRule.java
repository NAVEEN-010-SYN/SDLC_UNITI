package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.partner.PartnerTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A time-boxed incentive layered on top of the tier base rate, e.g. "+3% on SD-WAN sold on 36+
 * month terms this quarter" or "flat 150.00 per order containing hosted voice". A rule with no
 * category applies to every product; a rule with a minimum tier only pays partners at or above it.
 */
@Entity
@Table(name = "commission_rule")
public class CommissionRule extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 80)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "product_category", length = 20)
    private CatalogProduct.Category productCategory;

    @Enumerated(EnumType.STRING)
    @Column(name = "min_tier", length = 20)
    private PartnerTier minTier;

    @Column(name = "min_term_months", nullable = false)
    private int minTermMonths;

    @Column(name = "rate_bps", nullable = false)
    private int rateBps;

    @Column(name = "flat_bonus_minor", nullable = false)
    private long flatBonusMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "valid_from", nullable = false)
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    @Column(nullable = false)
    private boolean active;

    protected CommissionRule() {
    }

    public CommissionRule(UUID id, String name, CatalogProduct.Category productCategory, PartnerTier minTier,
                          int minTermMonths, int rateBps, long flatBonusMinor, String currency,
                          LocalDate validFrom, LocalDate validTo) {
        this.id = id;
        this.name = name;
        this.productCategory = productCategory;
        this.minTier = minTier;
        this.minTermMonths = minTermMonths;
        this.rateBps = rateBps;
        this.flatBonusMinor = flatBonusMinor;
        this.currency = currency;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.active = true;
    }

    public boolean isEffectiveOn(LocalDate date) {
        return active && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
    }

    /** Whether the rule pays this partner for an order of this term at all. */
    public boolean eligible(PartnerTier tier, int termMonths) {
        return (minTier == null || tier.compareTo(minTier) >= 0) && termMonths >= minTermMonths;
    }

    public boolean covers(CatalogProduct.Category category) {
        return productCategory == null || productCategory == category;
    }

    public void deactivate() {
        this.active = false;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public CatalogProduct.Category getProductCategory() {
        return productCategory;
    }

    public PartnerTier getMinTier() {
        return minTier;
    }

    public int getMinTermMonths() {
        return minTermMonths;
    }

    public int getRateBps() {
        return rateBps;
    }

    public long getFlatBonusMinor() {
        return flatBonusMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public LocalDate getValidFrom() {
        return validFrom;
    }

    public LocalDate getValidTo() {
        return validTo;
    }

    public boolean isActive() {
        return active;
    }
}

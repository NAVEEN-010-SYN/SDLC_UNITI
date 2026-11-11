package com.uniti.qa.data;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Immutable deal registration input. The monthly value is held as integer minor units.
 */
public record DealData(
        String customerName,
        String customerDomain,
        String contactEmail,
        List<String> products,
        int siteCount,
        long monthlyValueMinor,
        String currency,
        String notes) {

    public DealData {
        Objects.requireNonNull(customerName, "customerName");
        Objects.requireNonNull(customerDomain, "customerDomain");
        products = List.copyOf(products);
        if (siteCount < 1) {
            throw new IllegalArgumentException("siteCount must be >= 1");
        }
        if (monthlyValueMinor < 0) {
            throw new IllegalArgumentException("monthlyValueMinor must be >= 0");
        }
    }

    /** Builds a unique, valid deal tagged with a QA prefix so cleanup jobs can purge it. */
    public static DealData unique(List<String> products, int sites, long monthlyValueMinor) {
        String tag = "qa-" + UUID.randomUUID().toString().substring(0, 8);
        String domain = tag + ".qa.example.net";
        return new DealData("QA Freight " + tag.toUpperCase(Locale.ROOT), domain, "it-lead@" + domain,
                products, sites, monthlyValueMinor, "USD", null);
    }

    public DealData withNotes(String value) {
        return new DealData(customerName, customerDomain, contactEmail, products, siteCount, monthlyValueMinor, currency, value);
    }

    public DealData withCustomerName(String value) {
        return new DealData(value, customerDomain, contactEmail, products, siteCount, monthlyValueMinor, currency, notes);
    }

    /** Value as typed into the form, e.g. 2499.00 for 249900 minor units. */
    public String monthlyValueDisplay() {
        return BigDecimal.valueOf(monthlyValueMinor).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }
}

package com.uniti.partnerportal.common.money;

import com.fasterxml.jackson.annotation.JsonIgnore;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Immutable monetary amount in integer minor units (pence/cents) with an ISO-4217 currency.
 * All arithmetic that can produce fractions (percentages, basis points) rounds HALF_EVEN so
 * repeated calculations over many lines do not drift in either direction.
 */
public record Money(long amountMinor, String currency) implements Comparable<Money> {

    private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);
    private static final BigDecimal TEN_THOUSAND = BigDecimal.valueOf(10_000);

    public Money {
        Objects.requireNonNull(currency, "currency");
        if (currency.length() != 3) {
            throw new IllegalArgumentException("Currency must be a 3-letter ISO code: " + currency);
        }
        currency = currency.toUpperCase();
    }

    public static Money of(long amountMinor, String currency) {
        return new Money(amountMinor, currency);
    }

    public static Money zero(String currency) {
        return new Money(0L, currency);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(amountMinor, other.amountMinor), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(amountMinor, other.amountMinor), currency);
    }

    public Money times(long factor) {
        return new Money(Math.multiplyExact(amountMinor, factor), currency);
    }

    public Money negate() {
        return new Money(-amountMinor, currency);
    }

    /**
     * Applies a percentage (e.g. 12.5 for 12.5%) and returns the resulting portion.
     */
    public Money percentage(BigDecimal percent) {
        BigDecimal result = BigDecimal.valueOf(amountMinor)
                .multiply(percent)
                .divide(ONE_HUNDRED, 0, RoundingMode.HALF_EVEN);
        return new Money(result.longValueExact(), currency);
    }

    /**
     * Applies basis points (1 bps = 0.01%) and returns the resulting portion.
     */
    public Money basisPoints(long bps) {
        BigDecimal result = BigDecimal.valueOf(amountMinor)
                .multiply(BigDecimal.valueOf(bps))
                .divide(TEN_THOUSAND, 0, RoundingMode.HALF_EVEN);
        return new Money(result.longValueExact(), currency);
    }

    public Money discountBy(BigDecimal percent) {
        return minus(percentage(percent));
    }

    public Money min(Money other) {
        requireSameCurrency(other);
        return amountMinor <= other.amountMinor ? this : other;
    }

    public Money max(Money other) {
        requireSameCurrency(other);
        return amountMinor >= other.amountMinor ? this : other;
    }

    @JsonIgnore
    public boolean isNegative() {
        return amountMinor < 0;
    }

    @JsonIgnore
    public boolean isZero() {
        return amountMinor == 0;
    }

    public boolean isGreaterThan(Money other) {
        requireSameCurrency(other);
        return amountMinor > other.amountMinor;
    }

    public boolean isLessThan(Money other) {
        requireSameCurrency(other);
        return amountMinor < other.amountMinor;
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(amountMinor, other.amountMinor);
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new CurrencyMismatchException(currency, other.currency);
        }
    }

    @Override
    public String toString() {
        BigDecimal major = BigDecimal.valueOf(amountMinor).movePointLeft(2);
        return currency + " " + major.toPlainString();
    }

    public static final class CurrencyMismatchException extends IllegalArgumentException {
        public CurrencyMismatchException(String left, String right) {
            super("Cannot combine amounts in " + left + " and " + right);
        }
    }
}

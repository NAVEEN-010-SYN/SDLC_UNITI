package com.uniti.partnerportal.common.domain;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Year;

/**
 * Issues human-friendly business references (e.g. {@code DR-2026-000042}) backed by database
 * sequences so they are unique across application instances.
 */
@Component
public class ReferenceGenerator {

    public enum Kind {
        PARTNER("PTR", "partner_ref_seq"),
        LEAD("LD", "lead_ref_seq"),
        DEAL("DR", "deal_ref_seq"),
        QUOTE("QT", "quote_ref_seq"),
        ORDER("ORD", "order_ref_seq"),
        STATEMENT("CS", "statement_ref_seq"),
        MDF_CLAIM("MDF", "mdf_claim_ref_seq"),
        CASE("CASE", "case_ref_seq"),
        ACCOUNT("ACC", "account_ref_seq");

        private final String prefix;
        private final String sequence;

        Kind(String prefix, String sequence) {
            this.prefix = prefix;
            this.sequence = sequence;
        }
    }

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ReferenceGenerator(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public String next(Kind kind) {
        Long value = jdbc.queryForObject("SELECT nextval('" + kind.sequence + "')", Long.class);
        long seq = value == null ? 0 : value;
        if (kind == Kind.ACCOUNT) {
            return format(Kind.ACCOUNT, seq, 0);
        }
        return format(kind, seq, Year.now(clock).getValue());
    }

    /**
     * Account numbers follow the platform convention {@code ACC-########}; every other reference
     * is year-scoped so it reads naturally on statements and quotes.
     */
    static String format(Kind kind, long seq, int year) {
        if (kind == Kind.ACCOUNT) {
            return String.format("ACC-%08d", seq);
        }
        return String.format("%s-%d-%06d", kind.prefix, year, seq);
    }
}

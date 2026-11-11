package com.uniti.partnerportal;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.partner.PartnerTier;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Shared builders for unit tests: fixed clock, default properties and callers of each role. */
public final class TestFixtures {

    public static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");
    public static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    private TestFixtures() {
    }

    public static PortalProperties properties() {
        return new PortalProperties(
                new PortalProperties.Security("roles", "partner_id"),
                new PortalProperties.Cors(List.of()),
                new PortalProperties.Pricing("GBP", 30, 40),
                new PortalProperties.Deals(90, 30, 1, 0.85),
                new PortalProperties.Commissions(90, 200, 25_000L),
                new PortalProperties.Mdf(60, 50),
                new PortalProperties.Cases(Map.of(), Map.of()));
    }

    public static CurrentUser agent(UUID partnerId) {
        return new CurrentUser("agent-1", "agent@partner.example", "Agent", partnerId, Set.of(Roles.PARTNER_AGENT));
    }

    public static CurrentUser admin(UUID partnerId) {
        return new CurrentUser("admin-1", "admin@partner.example", "Admin", partnerId, Set.of(Roles.PARTNER_ADMIN));
    }

    public static CurrentUser manager(String subject) {
        return new CurrentUser(subject, subject + "@uniti.example", subject, null, Set.of(Roles.CHANNEL_MANAGER));
    }

    /** An ACTIVE partner at the given tier, walked through the real onboarding transitions. */
    public static Partner activePartner(UUID id, PartnerTier tier) {
        Partner partner = new Partner(id, "PTR-2026-000001", "Acme Networks Ltd", "AB123456", "GBP");
        partner.transitionTo(PartnerStatus.KYC_PENDING, null, NOW);
        partner.transitionTo(PartnerStatus.KYC_UNDER_REVIEW, null, NOW);
        partner.transitionTo(PartnerStatus.ACTIVE, null, NOW);
        partner.setTier(tier, NOW);
        return partner;
    }
}

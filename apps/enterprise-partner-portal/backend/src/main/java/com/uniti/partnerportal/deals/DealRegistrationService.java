package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.dto.DealDtos.ConflictCheckResponse;
import com.uniti.partnerportal.deals.dto.DealDtos.RegisterDealRequest;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerTier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Deal registration gives a partner time-boxed protection on an opportunity. Rules:
 * <ul>
 *   <li>A partner cannot register the same customer twice while a claim is open.</li>
 *   <li>Overlap with another partner's open claim parks the registration UNDER_REVIEW and
 *       records the conflicts; first-come wins unless a channel manager overrides with a reason.</li>
 *   <li>Clean registrations from GOLD/PLATINUM partners under the auto-approval ceiling are
 *       approved immediately; everything else awaits a channel manager.</li>
 *   <li>Approved registrations are protected for a fixed window and may be extended a limited
 *       number of times, only close to expiry.</li>
 * </ul>
 */
@Service
@Transactional
public class DealRegistrationService {

    private static final Logger log = LoggerFactory.getLogger(DealRegistrationService.class);
    static final long AUTO_APPROVE_MAX_MRC_MINOR = 500_000L;
    static final int EXTENSION_WINDOW_DAYS = 14;

    private final DealRegistrationRepository deals;
    private final DealConflictDetector detector;
    private final PartnerService partners;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public DealRegistrationService(DealRegistrationRepository deals, DealConflictDetector detector,
                                   PartnerService partners, ReferenceGenerator references,
                                   PortalProperties properties, Clock clock) {
        this.deals = deals;
        this.detector = detector;
        this.partners = partners;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    public DealRegistration register(RegisterDealRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        Partner partner = partners.requireTransactingPartner(partnerId);
        Instant now = Instant.now(clock);
        if (!request.expectedCloseDate().isAfter(LocalDate.now(clock))) {
            throw new PortalException.BusinessRule("deal.close_date_past", "Expected close date must be in the future");
        }

        DealRegistration deal = new DealRegistration(UUID.randomUUID(),
                references.next(ReferenceGenerator.Kind.DEAL), partnerId, user.subject(), now);
        apply(deal, request, partner.getCurrency());

        List<DealConflictDetector.Match> matches = findMatches(deal);
        rejectOwnDuplicates(partnerId, matches);
        List<DealConflictDetector.Match> foreign = matches.stream()
                .filter(m -> !m.existing().getPartnerId().equals(partnerId))
                .toList();

        if (!foreign.isEmpty()) {
            foreign.forEach(m -> deal.addConflict(toConflict(m, now)));
            deal.transitionTo(DealStatus.UNDER_REVIEW);
            log.info("deal_conflict_detected dealRef={} conflicts={}", deal.getReference(), foreign.size());
        } else if (qualifiesForAutoApproval(partner, deal)) {
            deal.decide(DealStatus.APPROVED, "system", "Auto-approved: no conflicts", now);
            deal.setProtectedUntil(LocalDate.now(clock).plusDays(properties.deals().protectionDays()));
        }
        return deals.save(deal);
    }

    /**
     * Lets a partner check for overlap before registering. Partners only learn that a conflict
     * exists, never whose claim it is.
     */
    @Transactional(readOnly = true)
    public ConflictCheckResponse precheck(RegisterDealRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        DealRegistration probe = new DealRegistration(UUID.randomUUID(), "PRECHECK", partnerId, user.subject(),
                Instant.now(clock));
        apply(probe, request, properties.pricing().defaultCurrency());
        List<DealConflictDetector.Match> matches = findMatches(probe);
        boolean own = matches.stream().anyMatch(m -> m.existing().getPartnerId().equals(partnerId));
        boolean foreign = matches.stream().anyMatch(m -> !m.existing().getPartnerId().equals(partnerId));
        List<String> reasons = matches.stream().flatMap(m -> m.reasons().stream()).map(Enum::name).distinct().toList();
        return new ConflictCheckResponse(foreign, own, reasons);
    }

    @Transactional(readOnly = true)
    public DealRegistration get(UUID dealId, CurrentUser user) {
        DealRegistration deal = load(dealId);
        user.assertCanAccess(deal.getPartnerId());
        return deal;
    }

    @Transactional(readOnly = true)
    public Page<DealRegistration> search(UUID partnerId, DealStatus status, boolean conflictOnly, String search,
                                         Pageable pageable, CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        String term = search == null || search.isBlank() ? null : search.trim();
        return deals.search(scope, status, conflictOnly, term, pageable);
    }

    public DealRegistration approve(UUID dealId, String reason, boolean overrideConflicts, CurrentUser manager) {
        DealRegistration deal = load(dealId);
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.now(clock);
        List<DealConflictDetector.Match> live = findMatches(deal).stream()
                .filter(m -> !m.existing().getPartnerId().equals(deal.getPartnerId()))
                .filter(m -> m.existing().isProtectedOn(today) || m.existing().getStatus() != DealStatus.APPROVED)
                .toList();
        boolean blocking = live.stream().anyMatch(m -> m.existing().isProtectedOn(today)
                || m.existing().getSubmittedAt().isBefore(deal.getSubmittedAt()));
        if (blocking && !overrideConflicts) {
            throw new PortalException.Conflict("deal.conflict_unresolved",
                    "An earlier or protected registration exists for this customer; reject this one or override")
                    .withDetail("conflictingReferences",
                            live.stream().map(m -> m.existing().getReference()).toList());
        }
        if (blocking) {
            log.warn("deal_conflict_overridden dealRef={} by={} reason={}", deal.getReference(),
                    manager.subject(), reason);
        }
        deal.decide(DealStatus.APPROVED, manager.subject(), reason, now);
        deal.setProtectedUntil(today.plusDays(properties.deals().protectionDays()));
        return deal;
    }

    public DealRegistration reject(UUID dealId, String reason, CurrentUser manager) {
        DealRegistration deal = load(dealId);
        deal.decide(DealStatus.REJECTED, manager.subject(), reason, Instant.now(clock));
        return deal;
    }

    public DealRegistration startReview(UUID dealId) {
        DealRegistration deal = load(dealId);
        deal.transitionTo(DealStatus.UNDER_REVIEW);
        return deal;
    }

    public DealRegistration withdraw(UUID dealId, String reason, CurrentUser user) {
        DealRegistration deal = get(dealId, user);
        deal.decide(DealStatus.WITHDRAWN, user.subject(), reason, Instant.now(clock));
        return deal;
    }

    public DealRegistration recordOutcome(UUID dealId, DealStatus outcome, String reason, CurrentUser user) {
        if (outcome != DealStatus.WON && outcome != DealStatus.LOST) {
            throw new PortalException.BusinessRule("deal.invalid_outcome", "Outcome must be WON or LOST");
        }
        DealRegistration deal = get(dealId, user);
        deal.decide(outcome, user.subject(), reason, Instant.now(clock));
        return deal;
    }

    public DealRegistration extend(UUID dealId, CurrentUser user) {
        DealRegistration deal = get(dealId, user);
        LocalDate today = LocalDate.now(clock);
        if (!deal.isProtectedOn(today)) {
            throw new PortalException.BusinessRule("deal.not_protected",
                    "Only approved registrations that are still protected can be extended");
        }
        if (deal.getExtensionsUsed() >= properties.deals().maxExtensions()) {
            throw new PortalException.BusinessRule("deal.extension_limit",
                    "This registration has already used its " + properties.deals().maxExtensions() + " extension(s)");
        }
        long daysLeft = ChronoUnit.DAYS.between(today, deal.getProtectedUntil());
        if (daysLeft > EXTENSION_WINDOW_DAYS) {
            throw new PortalException.BusinessRule("deal.extension_too_early",
                    "Extensions can be requested in the last " + EXTENSION_WINDOW_DAYS + " days of protection");
        }
        deal.extendProtection(properties.deals().extensionDays());
        return deal;
    }

    public boolean isExtensionAvailable(DealRegistration deal) {
        LocalDate today = LocalDate.now(clock);
        return deal.isProtectedOn(today)
                && deal.getExtensionsUsed() < properties.deals().maxExtensions()
                && ChronoUnit.DAYS.between(today, deal.getProtectedUntil()) <= EXTENSION_WINDOW_DAYS;
    }

    /**
     * Used when a quote references a registration: the deal must belong to the partner and be
     * approved (and still protected) or already won.
     */
    @Transactional(readOnly = true)
    public DealRegistration requireQuotableDeal(UUID dealId, UUID partnerId) {
        DealRegistration deal = load(dealId);
        if (!deal.getPartnerId().equals(partnerId)) {
            throw new PortalException.Forbidden("Deal registration belongs to another partner");
        }
        boolean ok = deal.isProtectedOn(LocalDate.now(clock)) || deal.getStatus() == DealStatus.WON;
        if (!ok) {
            throw new PortalException.BusinessRule("deal.not_quotable",
                    "Deal " + deal.getReference() + " is " + deal.getStatus() + " and cannot be quoted against");
        }
        return deal;
    }

    @Scheduled(cron = "0 15 0 * * *", zone = "UTC")
    public void expireLapsedRegistrations() {
        LocalDate today = LocalDate.now(clock);
        List<DealRegistration> lapsed = deals.findByStatusAndProtectedUntilBefore(DealStatus.APPROVED, today);
        for (DealRegistration deal : lapsed) {
            deal.decide(DealStatus.EXPIRED, "system", "Protection window lapsed", Instant.now(clock));
        }
        if (!lapsed.isEmpty()) {
            log.info("deal_registrations_expired count={}", lapsed.size());
        }
    }

    private List<DealConflictDetector.Match> findMatches(DealRegistration deal) {
        List<DealRegistration> candidates = deals.findConflictCandidates(DealStatus.CLAIMING, deal.getId(),
                deal.getOutwardCode(), deal.getCustomerDomain(), deal.getCustomerCompanyNumber(),
                deal.getNormalisedName());
        return detector.detect(deal, candidates);
    }

    private static void rejectOwnDuplicates(UUID partnerId, List<DealConflictDetector.Match> matches) {
        matches.stream()
                .filter(m -> m.existing().getPartnerId().equals(partnerId))
                .findFirst()
                .ifPresent(m -> {
                    throw new PortalException.Conflict("deal.duplicate_registration",
                            "You already have an open registration for this customer: " + m.existing().getReference())
                            .withDetail("existingReference", m.existing().getReference());
                });
    }

    private static boolean qualifiesForAutoApproval(Partner partner, DealRegistration deal) {
        return partner.getTier().compareTo(PartnerTier.GOLD) >= 0
                && deal.getEstimatedMrcMinor() <= AUTO_APPROVE_MAX_MRC_MINOR;
    }

    private static DealConflict toConflict(DealConflictDetector.Match m, Instant now) {
        return new DealConflict(UUID.randomUUID(), m.existing().getId(), m.existing().getPartnerId(),
                m.existing().getReference(), m.reasonsAsText(), m.score(), now);
    }

    private static void apply(DealRegistration deal, RegisterDealRequest request, String currency) {
        deal.setLeadId(request.leadId());
        deal.setCustomerName(request.customerName().trim());
        deal.setCustomerCompanyNumber(request.customerCompanyNumber() == null ? null
                : request.customerCompanyNumber().toUpperCase(Locale.ROOT));
        String domain = CompanyNameMatcher.customerDomain(request.customerWebsite());
        if (domain == null) {
            domain = CompanyNameMatcher.customerDomain(request.contactEmail());
        }
        deal.setCustomerDomain(domain);
        deal.setCustomerPostcode(request.customerPostcode().toUpperCase(Locale.ROOT).trim());
        deal.setContactName(request.contactName().trim());
        deal.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        deal.setSiteCount(request.siteCount());
        deal.setEstimatedMrcMinor(request.estimatedMrcMinor());
        deal.setCurrency(currency);
        deal.setExpectedCloseDate(request.expectedCloseDate());
        deal.setProductInterest(request.productInterest().trim());
    }

    private DealRegistration load(UUID dealId) {
        return deals.findById(dealId).orElseThrow(() -> new PortalException.NotFound("DealRegistration", dealId));
    }
}

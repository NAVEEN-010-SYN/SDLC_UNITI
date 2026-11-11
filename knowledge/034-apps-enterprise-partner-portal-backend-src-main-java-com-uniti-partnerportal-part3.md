# Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 3 of 8)

- **Application:** Enterprise Partner Portal
- **Tech stack:** Java Spring Boot 3 + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationController.java` (138 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationRepository.java` (72 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationService.java` (288 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealStatus.java` (32 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/dto/DealDtos.java` (84 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/Lead.java` (246 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadController.java` (105 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadRepository.java` (48 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadScorer.java` (72 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadService.java` (178 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/dto/LeadDtos.java` (73 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderController.java` (131 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvent.java` (80 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvents.java` (21 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderService.java` (231 lines)
- `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderSite.java` (190 lines)

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationController.java`.

```java
package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.deals.dto.DealDtos.ConflictCheckResponse;
import com.uniti.partnerportal.deals.dto.DealDtos.ConflictResponse;
import com.uniti.partnerportal.deals.dto.DealDtos.DealDecisionRequest;
import com.uniti.partnerportal.deals.dto.DealDtos.DealOutcomeRequest;
import com.uniti.partnerportal.deals.dto.DealDtos.DealResponse;
import com.uniti.partnerportal.deals.dto.DealDtos.RegisterDealRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/deals")
@Tag(name = "Deal registration", description = "Register opportunities, conflict detection and protection")
public class DealRegistrationController {

    private final DealRegistrationService service;
    private final CurrentUserProvider currentUser;

    public DealRegistrationController(DealRegistrationService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PageResponse<DealResponse> search(@RequestParam(required = false) UUID partnerId,
                                             @RequestParam(required = false) DealStatus status,
                                             @RequestParam(defaultValue = "false") boolean conflictOnly,
                                             @RequestParam(required = false) String q,
                                             @RequestParam(required = false) Integer page,
                                             @RequestParam(required = false) Integer pageSize) {
        CurrentUser user = currentUser.get();
        var result = service.search(partnerId, status, conflictOnly, q,
                PageResponse.pageable(page, pageSize), user);
        return PageResponse.from(result, d -> toResponse(d, user));
    }

    @PostMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Register a deal", description = "Runs conflict detection; may auto-approve")
    public ResponseEntity<DealResponse> register(@Valid @RequestBody RegisterDealRequest request) {
        CurrentUser user = currentUser.get();
        DealRegistration deal = service.register(request, user);
        return ResponseEntity.created(URI.create("/api/v1/deals/" + deal.getId())).body(toResponse(deal, user));
    }

    @PostMapping("/precheck")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Check for conflicting registrations without registering")
    public ConflictCheckResponse precheck(@Valid @RequestBody RegisterDealRequest request) {
        return service.precheck(request, currentUser.get());
    }

    @GetMapping("/{dealId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public DealResponse get(@PathVariable UUID dealId) {
        CurrentUser user = currentUser.get();
        return toResponse(service.get(dealId, user), user);
    }

    @PostMapping("/{dealId}/review")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public DealResponse startReview(@PathVariable UUID dealId) {
        return toResponse(service.startReview(dealId), currentUser.get());
    }

    @PostMapping("/{dealId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Approve a registration (internal)")
    public DealResponse approve(@PathVariable UUID dealId, @Valid @RequestBody DealDecisionRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.approve(dealId, request.reason(), request.overrideConflicts(), user), user);
    }

    @PostMapping("/{dealId}/reject")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public DealResponse reject(@PathVariable UUID dealId, @Valid @RequestBody DealDecisionRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.reject(dealId, request.reason(), user), user);
    }

    @PostMapping("/{dealId}/withdraw")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public DealResponse withdraw(@PathVariable UUID dealId, @Valid @RequestBody DealDecisionRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.withdraw(dealId, request.reason(), user), user);
    }

    @PostMapping("/{dealId}/outcome")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Record the deal as won or lost")
    public DealResponse outcome(@PathVariable UUID dealId, @Valid @RequestBody DealOutcomeRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.recordOutcome(dealId, request.outcome(), request.reason(), user), user);
    }

    @PostMapping("/{dealId}/extend")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Extend protection near expiry")
    public DealResponse extend(@PathVariable UUID dealId) {
        CurrentUser user = currentUser.get();
        return toResponse(service.extend(dealId, user), user);
    }

    private DealResponse toResponse(DealRegistration d, CurrentUser viewer) {
        var conflicts = d.getConflicts().stream()
                .map(c -> new ConflictResponse(
                        viewer.isInternal() ? c.getConflictingReference() : null,
                        viewer.isInternal() ? c.getConflictingPartnerId() : null,
                        c.getMatchReasons(), c.getScore(), c.getDetectedAt()))
                .toList();
        return new DealResponse(d.getId(), d.getReference(), d.getPartnerId(), d.getLeadId(), d.getCustomerName(),
                d.getCustomerCompanyNumber(), d.getCustomerDomain(), d.getCustomerPostcode(), d.getContactName(),
                d.getContactEmail(), d.getSiteCount(), d.getEstimatedMrcMinor(), d.getCurrency(),
                d.getExpectedCloseDate(), d.getProductInterest(), d.getStatus(), d.isHasConflict(), conflicts,
                d.getSubmittedAt(), d.getDecidedAt(), d.getDecisionReason(), d.getProtectedUntil(),
                d.getExtensionsUsed(), service.isExtensionAvailable(d));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationRepository.java`.

```java
package com.uniti.partnerportal.deals;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DealRegistrationRepository extends JpaRepository<DealRegistration, UUID> {

    /**
     * Candidate claims for conflict detection: any open registration that shares a postcode
     * district, customer domain, company number or exact normalised name. Fuzzy name scoring
     * then happens in memory on this narrowed set.
     */
    @Query("""
            SELECT d FROM DealRegistration d
            WHERE d.status IN :statuses
              AND d.id <> :excludeId
              AND (d.outwardCode = :outwardCode
                   OR (:domain IS NOT NULL AND d.customerDomain = :domain)
                   OR (:companyNumber IS NOT NULL AND d.customerCompanyNumber = :companyNumber)
                   OR d.normalisedName = :normalisedName)
            """)
    List<DealRegistration> findConflictCandidates(@Param("statuses") Collection<DealStatus> statuses,
                                                  @Param("excludeId") UUID excludeId,
                                                  @Param("outwardCode") String outwardCode,
                                                  @Param("domain") String domain,
                                                  @Param("companyNumber") String companyNumber,
                                                  @Param("normalisedName") String normalisedName);

    @Query("""
            SELECT d FROM DealRegistration d
            WHERE (:partnerId IS NULL OR d.partnerId = :partnerId)
              AND (:status IS NULL OR d.status = :status)
              AND (:conflictOnly = false OR d.hasConflict = true)
              AND (:search IS NULL
                   OR LOWER(d.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR d.reference = :search)
            """)
    Page<DealRegistration> search(@Param("partnerId") UUID partnerId,
                                  @Param("status") DealStatus status,
                                  @Param("conflictOnly") boolean conflictOnly,
                                  @Param("search") String search,
                                  Pageable pageable);

    List<DealRegistration> findByStatusAndProtectedUntilBefore(DealStatus status, LocalDate date);

    List<DealRegistration> findByPartnerIdAndStatusIn(UUID partnerId, Collection<DealStatus> statuses);

    @Query("""
            SELECT d.status AS status, COUNT(d) AS count, COALESCE(SUM(d.estimatedMrcMinor), 0) AS mrc
            FROM DealRegistration d
            WHERE d.partnerId = :partnerId AND d.submittedAt >= :since
            GROUP BY d.status
            """)
    List<StatusRollup> rollupByStatus(@Param("partnerId") UUID partnerId, @Param("since") java.time.Instant since);

    interface StatusRollup {
        DealStatus getStatus();

        long getCount();

        long getMrc();
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealRegistrationService.java`.

```java
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
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealStatus.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/DealStatus.java`.

```java
package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.domain.StateMachine;

import java.util.EnumSet;
import java.util.Set;

public enum DealStatus {
    SUBMITTED,
    UNDER_REVIEW,
    APPROVED,
    REJECTED,
    WON,
    LOST,
    EXPIRED,
    WITHDRAWN;

    public static final StateMachine<DealStatus> LIFECYCLE = StateMachine
            .builder("Deal registration", DealStatus.class)
            .allow(SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN)
            .allow(UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN)
            .allow(APPROVED, WON, LOST, EXPIRED, WITHDRAWN)
            .build();

    /** Registrations that still claim the customer and therefore participate in conflict checks. */
    public static final Set<DealStatus> CLAIMING = EnumSet.of(SUBMITTED, UNDER_REVIEW, APPROVED);

    public boolean isOpen() {
        return CLAIMING.contains(this);
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/dto/DealDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/deals/dto/DealDtos.java`.

```java
package com.uniti.partnerportal.deals.dto;

import com.uniti.partnerportal.deals.DealStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class DealDtos {

    private DealDtos() {
    }

    public record RegisterDealRequest(
            UUID partnerId,
            UUID leadId,
            @NotBlank @Size(max = 200) String customerName,
            @Pattern(regexp = "^[A-Z0-9]{8}$", message = "must be an 8-character company registration number")
            String customerCompanyNumber,
            @Size(max = 200) String customerWebsite,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String customerPostcode,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Min(1) @Max(500) int siteCount,
            @Positive long estimatedMrcMinor,
            @NotNull @Future LocalDate expectedCloseDate,
            @NotBlank @Size(max = 200) String productInterest) {
    }

    public record DealDecisionRequest(@NotBlank @Size(max = 500) String reason, boolean overrideConflicts) {
    }

    public record DealOutcomeRequest(@NotNull DealStatus outcome, @Size(max = 500) String reason) {
    }

    public record DealResponse(
            UUID id,
            String reference,
            UUID partnerId,
            UUID leadId,
            String customerName,
            String customerCompanyNumber,
            String customerDomain,
            String customerPostcode,
            String contactName,
            String contactEmail,
            int siteCount,
            long estimatedMrcMinor,
            String currency,
            LocalDate expectedCloseDate,
            String productInterest,
            DealStatus status,
            boolean hasConflict,
            List<ConflictResponse> conflicts,
            Instant submittedAt,
            Instant decidedAt,
            String decisionReason,
            LocalDate protectedUntil,
            int extensionsUsed,
            boolean extensionAvailable) {
    }

    /**
     * Conflict details shown to a partner deliberately omit the other partner's identity; only
     * internal users see whose claim overlaps.
     */
    public record ConflictResponse(String conflictingReference, UUID conflictingPartnerId, String matchReasons,
                                   int score, Instant detectedAt) {
    }

    public record ConflictCheckResponse(boolean conflict, boolean ownDuplicate, List<String> matchReasons) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/Lead.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/Lead.java`.

```java
package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import com.uniti.partnerportal.common.domain.StateMachine;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "partner_lead")
public class Lead extends AuditableEntity {

    public enum Status { NEW, CONTACTED, QUALIFIED, CONVERTED, DISQUALIFIED }

    public enum Source { REFERRAL, EVENT, WEBSITE, OUTBOUND, UNITI_SHARED, OTHER }

    public static final StateMachine<Status> LIFECYCLE = StateMachine.builder("Lead", Status.class)
            .allow(Status.NEW, Status.CONTACTED, Status.QUALIFIED, Status.DISQUALIFIED)
            .allow(Status.CONTACTED, Status.QUALIFIED, Status.DISQUALIFIED)
            .allow(Status.QUALIFIED, Status.CONVERTED, Status.DISQUALIFIED)
            .allow(Status.DISQUALIFIED, Status.NEW)
            .build();

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String reference;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "owner_subject", nullable = false, length = 120)
    private String ownerSubject;

    @Column(name = "company_name", nullable = false, length = 200)
    private String companyName;

    @Column(name = "contact_name", nullable = false, length = 120)
    private String contactName;

    @Column(name = "contact_email", nullable = false, length = 200)
    private String contactEmail;

    @Column(name = "contact_phone", length = 30)
    private String contactPhone;

    @Column(nullable = false, length = 10)
    private String postcode;

    @Column(name = "site_count", nullable = false)
    private int siteCount;

    @Column(name = "estimated_mrc_minor", nullable = false)
    private long estimatedMrcMinor;

    @Column(name = "product_interest", length = 200)
    private String productInterest;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Source source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(nullable = false)
    private int score;

    @Column(length = 2000)
    private String notes;

    @Column(name = "next_action_at")
    private Instant nextActionAt;

    @Column(name = "disqualify_reason", length = 300)
    private String disqualifyReason;

    @Column(name = "converted_deal_id")
    private UUID convertedDealId;

    protected Lead() {
    }

    public Lead(UUID id, String reference, UUID partnerId, String ownerSubject) {
        this.id = id;
        this.reference = reference;
        this.partnerId = partnerId;
        this.ownerSubject = ownerSubject;
        this.status = Status.NEW;
    }

    public void transitionTo(Status next) {
        LIFECYCLE.assertTransition(status, next);
        this.status = next;
        if (next != Status.DISQUALIFIED) {
            this.disqualifyReason = null;
        }
    }

    public void disqualify(String reason) {
        transitionTo(Status.DISQUALIFIED);
        this.disqualifyReason = reason;
    }

    public void markConverted(UUID dealId) {
        transitionTo(Status.CONVERTED);
        this.convertedDealId = dealId;
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

    public String getOwnerSubject() {
        return ownerSubject;
    }

    public void setOwnerSubject(String ownerSubject) {
        this.ownerSubject = ownerSubject;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getContactName() {
        return contactName;
    }

    public void setContactName(String contactName) {
        this.contactName = contactName;
    }

    public String getContactEmail() {
        return contactEmail;
    }

    public void setContactEmail(String contactEmail) {
        this.contactEmail = contactEmail;
    }

    public String getContactPhone() {
        return contactPhone;
    }

    public void setContactPhone(String contactPhone) {
        this.contactPhone = contactPhone;
    }

    public String getPostcode() {
        return postcode;
    }

    public void setPostcode(String postcode) {
        this.postcode = postcode;
    }

    public int getSiteCount() {
        return siteCount;
    }

    public void setSiteCount(int siteCount) {
        this.siteCount = siteCount;
    }

    public long getEstimatedMrcMinor() {
        return estimatedMrcMinor;
    }

    public void setEstimatedMrcMinor(long estimatedMrcMinor) {
        this.estimatedMrcMinor = estimatedMrcMinor;
    }

    public String getProductInterest() {
        return productInterest;
    }

    public void setProductInterest(String productInterest) {
        this.productInterest = productInterest;
    }

    public Source getSource() {
        return source;
    }

    public void setSource(Source source) {
        this.source = source;
    }

    public Status getStatus() {
        return status;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Instant getNextActionAt() {
        return nextActionAt;
    }

    public void setNextActionAt(Instant nextActionAt) {
        this.nextActionAt = nextActionAt;
    }

    public String getDisqualifyReason() {
        return disqualifyReason;
    }

    public UUID getConvertedDealId() {
        return convertedDealId;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadController.java`.

```java
package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.deals.DealRegistration;
import com.uniti.partnerportal.leads.dto.LeadDtos.AssignLeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.ConvertLeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadResponse;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadTransitionRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/leads")
@PreAuthorize("hasAnyRole('PARTNER_ADMIN','PARTNER_AGENT')")
@Tag(name = "Leads", description = "Partner lead pipeline")
public class LeadController {

    private final LeadService service;
    private final CurrentUserProvider currentUser;

    public LeadController(LeadService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    public PageResponse<LeadResponse> search(@RequestParam(required = false) Lead.Status status,
                                             @RequestParam(defaultValue = "false") boolean mine,
                                             @RequestParam(required = false) Integer minScore,
                                             @RequestParam(required = false) String q,
                                             @RequestParam(required = false) Integer page,
                                             @RequestParam(required = false) Integer pageSize,
                                             @RequestParam(defaultValue = "createdAt") String sort) {
        Sort order = "score".equals(sort) ? Sort.by(Sort.Direction.DESC, "score")
                : Sort.by(Sort.Direction.DESC, "createdAt");
        var result = service.search(status, mine, minScore, q, PageResponse.pageable(page, pageSize, order),
                currentUser.get());
        return PageResponse.from(result, service::toResponse);
    }

    @GetMapping("/overdue")
    @Operation(summary = "Open leads whose next action date has passed")
    public List<LeadResponse> overdue() {
        return service.overdue(currentUser.get()).stream().map(service::toResponse).toList();
    }

    @PostMapping
    public ResponseEntity<LeadResponse> create(@Valid @RequestBody LeadRequest request) {
        Lead lead = service.create(request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/leads/" + lead.getId())).body(service.toResponse(lead));
    }

    @GetMapping("/{leadId}")
    public LeadResponse get(@PathVariable UUID leadId) {
        return service.toResponse(service.get(leadId, currentUser.get()));
    }

    @PutMapping("/{leadId}")
    public LeadResponse update(@PathVariable UUID leadId, @Valid @RequestBody LeadRequest request) {
        return service.toResponse(service.update(leadId, request, currentUser.get()));
    }

    @PostMapping("/{leadId}/transition")
    @Operation(summary = "Move a lead through the pipeline")
    public LeadResponse transition(@PathVariable UUID leadId, @Valid @RequestBody LeadTransitionRequest request) {
        return service.toResponse(service.transition(leadId, request.status(), request.reason(), currentUser.get()));
    }

    @PostMapping("/{leadId}/assign")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    public LeadResponse assign(@PathVariable UUID leadId, @Valid @RequestBody AssignLeadRequest request) {
        return service.toResponse(service.assign(leadId, request.ownerSubject(), currentUser.get()));
    }

    @PostMapping("/{leadId}/convert")
    @Operation(summary = "Convert a qualified lead into a deal registration")
    public ResponseEntity<Map<String, Object>> convert(@PathVariable UUID leadId,
                                                       @Valid @RequestBody ConvertLeadRequest request) {
        DealRegistration deal = service.convert(leadId, request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/deals/" + deal.getId()))
                .body(Map.of("dealId", deal.getId(), "dealReference", deal.getReference(),
                        "dealStatus", deal.getStatus(), "hasConflict", deal.isHasConflict()));
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadRepository.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadRepository.java`.

```java
package com.uniti.partnerportal.leads;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface LeadRepository extends JpaRepository<Lead, UUID> {

    @Query("""
            SELECT l FROM Lead l
            WHERE l.partnerId = :partnerId
              AND (:status IS NULL OR l.status = :status)
              AND (:owner IS NULL OR l.ownerSubject = :owner)
              AND (:minScore IS NULL OR l.score >= :minScore)
              AND (:search IS NULL
                   OR LOWER(l.companyName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(l.contactName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR l.reference = :search)
            """)
    Page<Lead> search(@Param("partnerId") UUID partnerId,
                      @Param("status") Lead.Status status,
                      @Param("owner") String owner,
                      @Param("minScore") Integer minScore,
                      @Param("search") String search,
                      Pageable pageable);

    @Query("""
            SELECT l FROM Lead l
            WHERE l.partnerId = :partnerId
              AND l.status IN (com.uniti.partnerportal.leads.Lead.Status.NEW,
                               com.uniti.partnerportal.leads.Lead.Status.CONTACTED,
                               com.uniti.partnerportal.leads.Lead.Status.QUALIFIED)
              AND l.nextActionAt < :now
            ORDER BY l.nextActionAt
            """)
    List<Lead> findOverdue(@Param("partnerId") UUID partnerId, @Param("now") Instant now);

    long countByPartnerIdAndStatus(UUID partnerId, Lead.Status status);

    long countByPartnerIdAndCreatedAtAfter(UUID partnerId, Instant since);
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadScorer.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadScorer.java`.

```java
package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.deals.CompanyNameMatcher;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Simple, explainable lead score (0-100) so agents work the most valuable opportunities first.
 * <ul>
 *   <li>Value: up to 40 points, scaled on estimated monthly spend (capped at 5,000.00).</li>
 *   <li>Footprint: up to 25 points for multi-site customers.</li>
 *   <li>Contact quality: 10 points for a corporate (non-free-mail) address, 5 for a phone.</li>
 *   <li>Source: Uniti-shared and referral leads convert best.</li>
 *   <li>Product fit: SD-WAN and gigabit interest indicates an enterprise buyer.</li>
 * </ul>
 */
@Component
public class LeadScorer {

    static final long VALUE_CAP_MINOR = 500_000L;

    public int score(Lead lead) {
        int score = 0;
        long value = Math.min(Math.max(lead.getEstimatedMrcMinor(), 0), VALUE_CAP_MINOR);
        score += (int) (value * 40 / VALUE_CAP_MINOR);

        int sites = lead.getSiteCount();
        if (sites >= 20) {
            score += 25;
        } else if (sites >= 5) {
            score += 15;
        } else if (sites >= 2) {
            score += 8;
        }

        if (CompanyNameMatcher.customerDomain(lead.getContactEmail()) != null) {
            score += 10;
        }
        if (lead.getContactPhone() != null && !lead.getContactPhone().isBlank()) {
            score += 5;
        }

        score += switch (lead.getSource() == null ? Lead.Source.OTHER : lead.getSource()) {
            case UNITI_SHARED -> 12;
            case REFERRAL -> 10;
            case EVENT -> 6;
            case WEBSITE -> 5;
            case OUTBOUND -> 3;
            case OTHER -> 0;
        };

        String interest = lead.getProductInterest() == null ? "" : lead.getProductInterest().toLowerCase(Locale.ROOT);
        if (interest.contains("sd-wan") || interest.contains("sdwan")) {
            score += 8;
        } else if (interest.contains("2 gbps") || interest.contains("1 gbps") || interest.contains("gigabit")) {
            score += 5;
        }
        return Math.min(score, 100);
    }

    public String band(int score) {
        if (score >= 70) {
            return "HOT";
        }
        if (score >= 40) {
            return "WARM";
        }
        return "COLD";
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/LeadService.java`.

```java
package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistration;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.deals.dto.DealDtos.RegisterDealRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.ConvertLeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadResponse;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.users.PartnerUser;
import com.uniti.partnerportal.users.PartnerUserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Lead pipeline for partner agents. Leads are private to the partner; converting a qualified
 * lead registers a deal (which is where cross-partner conflict detection happens).
 */
@Service
@Transactional
public class LeadService {

    private final LeadRepository leads;
    private final LeadScorer scorer;
    private final PartnerService partners;
    private final PartnerUserRepository users;
    private final DealRegistrationService deals;
    private final ReferenceGenerator references;
    private final Clock clock;

    public LeadService(LeadRepository leads, LeadScorer scorer, PartnerService partners, PartnerUserRepository users,
                       DealRegistrationService deals, ReferenceGenerator references, Clock clock) {
        this.leads = leads;
        this.scorer = scorer;
        this.partners = partners;
        this.users = users;
        this.deals = deals;
        this.references = references;
        this.clock = clock;
    }

    public Lead create(LeadRequest request, CurrentUser user) {
        UUID partnerId = user.requirePartnerId();
        partners.requireTransactingPartner(partnerId);
        Lead lead = new Lead(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.LEAD), partnerId,
                user.subject());
        apply(lead, request);
        return leads.save(lead);
    }

    public Lead update(UUID leadId, LeadRequest request, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (lead.getStatus() == Lead.Status.CONVERTED) {
            throw new PortalException.BusinessRule("lead.converted", "A converted lead can no longer be edited");
        }
        apply(lead, request);
        return lead;
    }

    @Transactional(readOnly = true)
    public Lead get(UUID leadId, CurrentUser user) {
        return loadForUser(leadId, user);
    }

    @Transactional(readOnly = true)
    public Page<Lead> search(Lead.Status status, boolean mineOnly, Integer minScore, String search,
                             Pageable pageable, CurrentUser user) {
        UUID partnerId = user.requirePartnerId();
        String owner = mineOnly || !user.isPartnerAdmin() ? user.subject() : null;
        String term = search == null || search.isBlank() ? null : search.trim();
        return leads.search(partnerId, status, owner, minScore, term, pageable);
    }

    @Transactional(readOnly = true)
    public List<Lead> overdue(CurrentUser user) {
        return leads.findOverdue(user.requirePartnerId(), Instant.now(clock)).stream()
                .filter(l -> user.isPartnerAdmin() || l.getOwnerSubject().equals(user.subject()))
                .toList();
    }

    public Lead transition(UUID leadId, Lead.Status target, String reason, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (target == Lead.Status.CONVERTED) {
            throw new PortalException.BusinessRule("lead.use_convert", "Use the convert action to convert a lead");
        }
        if (target == Lead.Status.DISQUALIFIED) {
            if (reason == null || reason.isBlank()) {
                throw new PortalException.BusinessRule("lead.reason_required", "A reason is required to disqualify");
            }
            lead.disqualify(reason.trim());
        } else {
            lead.transitionTo(target);
        }
        return lead;
    }

    /**
     * Reassigns a lead to another active agent of the same partner (admins only).
     */
    public Lead assign(UUID leadId, String ownerSubject, CurrentUser user) {
        if (!user.isPartnerAdmin()) {
            throw new PortalException.Forbidden("Only partner administrators can reassign leads");
        }
        Lead lead = loadForUser(leadId, user);
        PartnerUser owner = users.findByIdpSubject(ownerSubject)
                .filter(u -> u.getPartnerId().equals(lead.getPartnerId()))
                .filter(u -> u.getStatus() == PartnerUser.Status.ACTIVE)
                .orElseThrow(() -> new PortalException.BusinessRule("lead.invalid_owner",
                        "The new owner must be an active user of the same partner"));
        lead.setOwnerSubject(owner.getIdpSubject());
        return lead;
    }

    public DealRegistration convert(UUID leadId, ConvertLeadRequest request, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (lead.getStatus() != Lead.Status.QUALIFIED) {
            throw new PortalException.BusinessRule("lead.not_qualified", "Only qualified leads can be converted");
        }
        if (lead.getEstimatedMrcMinor() <= 0) {
            throw new PortalException.BusinessRule("lead.value_required",
                    "Set an estimated monthly value before converting");
        }
        RegisterDealRequest dealRequest = new RegisterDealRequest(
                lead.getPartnerId(), lead.getId(), lead.getCompanyName(), request.customerCompanyNumber(),
                request.customerWebsite(), lead.getPostcode(), lead.getContactName(), lead.getContactEmail(),
                lead.getSiteCount(), lead.getEstimatedMrcMinor(), request.expectedCloseDate(),
                lead.getProductInterest() == null ? "Fibre connectivity" : lead.getProductInterest());
        DealRegistration deal = deals.register(dealRequest, user);
        lead.markConverted(deal.getId());
        return deal;
    }

    public LeadResponse toResponse(Lead l) {
        return new LeadResponse(l.getId(), l.getReference(), l.getPartnerId(), l.getOwnerSubject(),
                l.getCompanyName(), l.getContactName(), l.getContactEmail(), l.getContactPhone(), l.getPostcode(),
                l.getSiteCount(), l.getEstimatedMrcMinor(), l.getProductInterest(), l.getSource(), l.getStatus(),
                l.getScore(), scorer.band(l.getScore()), l.getNotes(), l.getNextActionAt(), l.getDisqualifyReason(),
                l.getConvertedDealId(), l.getCreatedAt());
    }

    private void apply(Lead lead, LeadRequest request) {
        lead.setCompanyName(request.companyName().trim());
        lead.setContactName(request.contactName().trim());
        lead.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        lead.setContactPhone(request.contactPhone());
        lead.setPostcode(request.postcode().trim().toUpperCase(Locale.ROOT));
        lead.setSiteCount(request.siteCount());
        lead.setEstimatedMrcMinor(request.estimatedMrcMinor());
        lead.setProductInterest(request.productInterest());
        lead.setSource(request.source());
        lead.setNotes(request.notes());
        lead.setNextActionAt(request.nextActionAt());
        lead.setScore(scorer.score(lead));
    }

    private Lead loadForUser(UUID leadId, CurrentUser user) {
        Lead lead = leads.findById(leadId).orElseThrow(() -> new PortalException.NotFound("Lead", leadId));
        user.assertCanAccess(lead.getPartnerId());
        boolean ownerOrAdmin = user.isInternal() || user.isPartnerAdmin()
                || lead.getOwnerSubject().equals(user.subject());
        if (!ownerOrAdmin) {
            throw new PortalException.Forbidden("This lead is owned by another agent");
        }
        return lead;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/dto/LeadDtos.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/leads/dto/LeadDtos.java`.

```java
package com.uniti.partnerportal.leads.dto;

import com.uniti.partnerportal.leads.Lead;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class LeadDtos {

    private LeadDtos() {
    }

    public record LeadRequest(
            @NotBlank @Size(max = 200) String companyName,
            @NotBlank @Size(max = 120) String contactName,
            @NotBlank @Email @Size(max = 200) String contactEmail,
            @Pattern(regexp = "^\\+?[0-9 ]{7,20}$", message = "must be a valid phone number") String contactPhone,
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9 ]{5,8}$", message = "must be a valid postcode") String postcode,
            @Min(1) @Max(500) int siteCount,
            @PositiveOrZero long estimatedMrcMinor,
            @Size(max = 200) String productInterest,
            @NotNull Lead.Source source,
            @Size(max = 2000) String notes,
            @Future Instant nextActionAt) {
    }

    public record LeadTransitionRequest(@NotNull Lead.Status status, @Size(max = 300) String reason) {
    }

    public record AssignLeadRequest(@NotBlank @Size(max = 120) String ownerSubject) {
    }

    public record ConvertLeadRequest(
            @Pattern(regexp = "^[A-Z0-9]{8}$") String customerCompanyNumber,
            @Size(max = 200) String customerWebsite,
            @NotNull @Future LocalDate expectedCloseDate) {
    }

    public record LeadResponse(
            UUID id,
            String reference,
            UUID partnerId,
            String ownerSubject,
            String companyName,
            String contactName,
            String contactEmail,
            String contactPhone,
            String postcode,
            int siteCount,
            long estimatedMrcMinor,
            String productInterest,
            Lead.Source source,
            Lead.Status status,
            int score,
            String scoreBand,
            String notes,
            Instant nextActionAt,
            String disqualifyReason,
            UUID convertedDealId,
            Instant createdAt) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderController.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderController.java`.

```java
package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.CreateOrderRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderEventResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderReasonRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.OrderSiteResponse;
import com.uniti.partnerportal.orders.dto.OrderDtos.SiteProgressRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders", description = "Orders placed for customers and provisioning status")
public class OrderController {

    private final OrderService service;
    private final CurrentUserProvider currentUser;

    public OrderController(OrderService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PageResponse<OrderResponse> search(@RequestParam(required = false) UUID partnerId,
                                              @RequestParam(required = false) OrderStatus status,
                                              @RequestParam(required = false) String q,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer pageSize) {
        var result = service.search(partnerId, status, q, PageResponse.pageable(page, pageSize), currentUser.get());
        return PageResponse.from(result, OrderController::toResponse);
    }

    @PostMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Order an accepted quote")
    public ResponseEntity<OrderResponse> create(@Valid @RequestBody CreateOrderRequest request) {
        PartnerOrder order = service.createFromQuote(request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/orders/" + order.getId())).body(toResponse(order));
    }

    @GetMapping("/{orderId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Order with per-site provisioning status and timeline")
    public OrderResponse get(@PathVariable UUID orderId) {
        return toResponse(service.get(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/cancel")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public OrderResponse cancel(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.cancel(orderId, request.reason(), currentUser.get()));
    }

    @PostMapping("/{orderId}/resubmit")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public OrderResponse resubmit(@PathVariable UUID orderId) {
        return toResponse(service.resubmit(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/validate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse validate(@PathVariable UUID orderId) {
        return toResponse(service.validate(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/provision")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse provision(@PathVariable UUID orderId) {
        return toResponse(service.startProvisioning(orderId, currentUser.get()));
    }

    @PostMapping("/{orderId}/fail")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public OrderResponse fail(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.fail(orderId, request.reason(), currentUser.get()));
    }

    @PostMapping("/{orderId}/sites/{siteId}/progress")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record provisioning progress for one site")
    public OrderResponse progress(@PathVariable UUID orderId, @PathVariable UUID siteId,
                                  @Valid @RequestBody SiteProgressRequest request) {
        return toResponse(service.updateSite(orderId, siteId, request, currentUser.get()));
    }

    @PostMapping("/{orderId}/early-termination")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record early termination of an active service (may trigger clawback)")
    public OrderResponse terminate(@PathVariable UUID orderId, @Valid @RequestBody OrderReasonRequest request) {
        return toResponse(service.recordEarlyTermination(orderId, request.reason(), currentUser.get()));
    }

    static OrderResponse toResponse(PartnerOrder o) {
        var sites = o.getSites().stream()
                .map(s -> new OrderSiteResponse(s.getId(), s.getSiteNo(), s.getSiteName(), s.getSitePostcode(),
                        s.getSku(), s.getProductName(), s.getProductCategory(), s.getQuantity(), s.getNetMrcMinor(),
                        s.getStage(), s.getEngineerVisitDate(), s.getServiceId(), s.getStageUpdatedAt(),
                        s.getBlockerNote()))
                .toList();
        var timeline = o.getEvents().stream()
                .map(e -> new OrderEventResponse(e.getType(), e.getActor(), e.getDetail(), e.getOccurredAt()))
                .toList();
        int live = (int) o.getSites().stream().filter(s -> s.getStage() == ProvisioningStage.LIVE).count();
        return new OrderResponse(o.getId(), o.getReference(), o.getPartnerId(), o.getQuoteId(), o.getQuoteReference(),
                o.getDealId(), o.getCustomerName(), o.getCustomerAccountId(), o.isNewLogo(),
                o.getPurchaseOrderNumber(), o.getTermMonths(), o.getCurrency(), o.getMonthlyRecurringMinor(),
                o.getOneOffMinor(), o.getStatus(), o.getStatusReason(), live, o.getSites().size(),
                o.getRequestedInstallDate(), o.getSubmittedAt(), o.getActivatedAt(), o.getCeasedAt(), sites, timeline,
                o.getCreatedAt());
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvent.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvent.java`.

```java
package com.uniti.partnerportal.orders;

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
import java.util.UUID;

/** Append-only timeline entry shown to the partner as the order tracking history. */
@Entity
@Table(name = "order_event")
public class OrderEvent {

    public enum Type { STATUS_CHANGED, SITE_UPDATED, NOTE }

    static final int MAX_DETAIL = 500;

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private PartnerOrder order;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Type type;

    @Column(nullable = false, length = 120)
    private String actor;

    @Column(nullable = false, length = MAX_DETAIL)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    protected OrderEvent() {
    }

    OrderEvent(UUID id, Type type, String actor, String detail, Instant occurredAt) {
        this.id = id;
        this.type = type;
        this.actor = actor;
        this.detail = detail.length() > MAX_DETAIL ? detail.substring(0, MAX_DETAIL) : detail;
        this.occurredAt = occurredAt;
    }

    void setOrder(PartnerOrder order) {
        this.order = order;
    }

    public UUID getId() {
        return id;
    }

    public Type getType() {
        return type;
    }

    public String getActor() {
        return actor;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvents.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderEvents.java`.

```java
package com.uniti.partnerportal.orders;

import java.time.Instant;
import java.util.UUID;

/**
 * Domain events published by the orders module. Commissions listens to these rather than the
 * order service calling it directly, so fulfilment never depends on the payout ledger.
 */
public final class OrderEvents {

    private OrderEvents() {
    }

    public record OrderActivated(UUID orderId, UUID partnerId, Instant activatedAt) {
    }

    public record OrderCeased(UUID orderId, UUID partnerId, Instant activatedAt, Instant ceasedAt, String reason) {
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderService.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderService.java`.

```java
package com.uniti.partnerportal.orders;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.orders.dto.OrderDtos.CreateOrderRequest;
import com.uniti.partnerportal.orders.dto.OrderDtos.SiteProgressRequest;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.Quote;
import com.uniti.partnerportal.quotes.QuoteLine;
import com.uniti.partnerportal.quotes.QuoteService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Orders placed on behalf of customers and their provisioning progress. Partners create and may
 * cancel orders before provisioning starts; validation, provisioning updates and early
 * termination are internal (channel desk or the provisioning integration).
 */
@Service
@Transactional
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final PartnerOrderRepository orders;
    private final QuoteService quotes;
    private final CatalogProductRepository catalog;
    private final PartnerService partners;
    private final ReferenceGenerator references;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public OrderService(PartnerOrderRepository orders, QuoteService quotes, CatalogProductRepository catalog,
                        PartnerService partners, ReferenceGenerator references, ApplicationEventPublisher events,
                        Clock clock) {
        this.orders = orders;
        this.quotes = quotes;
        this.catalog = catalog;
        this.partners = partners;
        this.references = references;
        this.events = events;
        this.clock = clock;
    }

    /**
     * Turns an accepted quote into a submitted order. Customers without an account get one
     * minted here and the order is flagged as a new logo (which earns a commission bonus).
     */
    public PartnerOrder createFromQuote(CreateOrderRequest request, CurrentUser user) {
        orders.findByQuoteId(request.quoteId()).ifPresent(existing -> {
            throw new PortalException.Conflict("order.duplicate_quote",
                    "Quote has already been ordered as " + existing.getReference())
                    .withDetail("orderId", existing.getId().toString());
        });
        Quote quote = quotes.claimForOrder(request.quoteId(), user);
        partners.requireTransactingPartner(quote.getPartnerId());
        Instant now = Instant.now(clock);

        PartnerOrder order = new PartnerOrder(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.ORDER),
                quote.getPartnerId(), quote.getId(), quote.getReference(), quote.getCurrency(), user.subject());
        order.setDealId(quote.getDealId());
        order.setCustomerName(quote.getCustomerName());
        order.setCustomerContactEmail(quote.getCustomerContactEmail());
        order.setTermMonths(quote.getTermMonths());
        order.setPurchaseOrderNumber(request.purchaseOrderNumber());
        order.setRequestedInstallDate(request.requestedInstallDate());
        order.setCharges(quote.getNetMrcMinor(), quote.getNrcMinor());
        boolean newLogo = quote.getCustomerAccountId() == null;
        order.assignAccount(newLogo ? references.next(ReferenceGenerator.Kind.ACCOUNT)
                : quote.getCustomerAccountId(), newLogo);

        Map<String, CatalogProduct> products = catalog.findBySkuIn(
                        quote.getLines().stream().map(QuoteLine::getSku).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CatalogProduct::getSku, Function.identity()));
        for (QuoteLine line : quote.getLines()) {
            CatalogProduct product = products.get(line.getSku());
            if (product == null) {
                throw new PortalException.BusinessRule("order.product_missing",
                        "Product " + line.getSku() + " is no longer in the catalog");
            }
            order.addSite(new OrderSite(UUID.randomUUID(), line.getLineNo(), line.getSiteName(),
                    line.getSitePostcode(), line.getSku(), line.getProductName(), product.getCategory(),
                    line.getQuantity(), line.getNetMrcMinor()));
        }
        order.transitionTo(OrderStatus.SUBMITTED, user.subject(), "Created from quote " + quote.getReference(), now);
        PartnerOrder saved = orders.save(order);
        log.info("order_submitted orderRef={} quoteRef={} newLogo={}", saved.getReference(), quote.getReference(),
                newLogo);
        return saved;
    }

    @Transactional(readOnly = true)
    public PartnerOrder get(UUID orderId, CurrentUser user) {
        PartnerOrder order = load(orderId);
        user.assertCanAccess(order.getPartnerId());
        return order;
    }

    @Transactional(readOnly = true)
    public Page<PartnerOrder> search(UUID partnerId, OrderStatus status, String search, Pageable pageable,
                                     CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        String term = search == null || search.isBlank() ? null : search.trim();
        return orders.search(scope, status, term, pageable);
    }

    public PartnerOrder cancel(UUID orderId, String reason, CurrentUser user) {
        PartnerOrder order = get(orderId, user);
        order.transitionTo(OrderStatus.CANCELLED, user.subject(), reason, Instant.now(clock));
        return order;
    }

    public PartnerOrder validate(UUID orderId, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.VALIDATED, manager.subject(), "Order validated", Instant.now(clock));
        return order;
    }

    public PartnerOrder startProvisioning(UUID orderId, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.PROVISIONING, manager.subject(), "Provisioning started", Instant.now(clock));
        return order;
    }

    public PartnerOrder fail(UUID orderId, String reason, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        order.transitionTo(OrderStatus.FAILED, manager.subject(), reason, Instant.now(clock));
        return order;
    }

    /**
     * A failed order can be resubmitted by the partner once the cause has been fixed (for
     * example a wrong site address); sites keep the provisioning progress already made.
     */
    public PartnerOrder resubmit(UUID orderId, CurrentUser user) {
        PartnerOrder order = get(orderId, user);
        order.transitionTo(OrderStatus.SUBMITTED, user.subject(), "Resubmitted after failure", Instant.now(clock));
        return order;
    }

    /**
     * Records progress on one site. When the last site goes live the order becomes ACTIVE and
     * an {@link OrderEvents.OrderActivated} event is published for commission accrual.
     */
    public PartnerOrder updateSite(UUID orderId, UUID siteId, SiteProgressRequest request, CurrentUser actor) {
        PartnerOrder order = load(orderId);
        if (order.getStatus() != OrderStatus.PROVISIONING) {
            throw new PortalException.BusinessRule("order.not_provisioning",
                    "Site progress can only be recorded while the order is provisioning");
        }
        OrderSite site = order.getSites().stream()
                .filter(s -> s.getId().equals(siteId))
                .findFirst()
                .orElseThrow(() -> new PortalException.NotFound("OrderSite", siteId));
        if (!site.canMoveTo(request.stage())) {
            throw new PortalException.Conflict("order.site_invalid_stage",
                    "Site " + site.getSiteNo() + " cannot move from " + site.getStage() + " to " + request.stage());
        }
        if (request.stage() == ProvisioningStage.BLOCKED && (request.note() == null || request.note().isBlank())) {
            throw new PortalException.BusinessRule("order.blocker_note_required", "Explain why the site is blocked");
        }
        if (request.stage() == ProvisioningStage.LIVE && blankToNull(request.serviceId()) == null
                && site.getServiceId() == null) {
            throw new PortalException.BusinessRule("order.service_id_required",
                    "A live site must carry the service ID it was provisioned as");
        }
        Instant now = Instant.now(clock);
        site.moveTo(request.stage(), request.note(), now);
        if (request.engineerVisitDate() != null) {
            site.setEngineerVisitDate(request.engineerVisitDate());
        }
        if (blankToNull(request.serviceId()) != null) {
            site.setServiceId(request.serviceId().trim());
        }
        String detail = "Site " + site.getSiteNo() + " (" + site.getSiteName() + ") -> " + request.stage()
                + (request.note() == null || request.note().isBlank() ? "" : ": " + request.note());
        order.record(OrderEvent.Type.SITE_UPDATED, actor.subject(), detail, now);

        if (order.allSitesLive()) {
            order.transitionTo(OrderStatus.ACTIVE, actor.subject(), "All sites live", now);
            events.publishEvent(new OrderEvents.OrderActivated(order.getId(), order.getPartnerId(), now));
            log.info("order_activated orderRef={} mrc={}", order.getReference(), order.getMonthlyRecurringMinor());
        }
        return order;
    }

    /**
     * Records that the customer terminated an active service early. Commissions decides whether
     * this falls inside the clawback window.
     */
    public PartnerOrder recordEarlyTermination(UUID orderId, String reason, CurrentUser manager) {
        PartnerOrder order = load(orderId);
        if (order.getStatus() != OrderStatus.ACTIVE) {
            throw new PortalException.BusinessRule("order.not_active", "Only active orders can be terminated");
        }
        if (order.getCeasedAt() != null) {
            throw new PortalException.Conflict("order.already_ceased", "Termination has already been recorded");
        }
        Instant now = Instant.now(clock);
        order.markCeased(now, reason);
        order.record(OrderEvent.Type.NOTE, manager.subject(), "Service terminated early: " + reason, now);
        events.publishEvent(new OrderEvents.OrderCeased(order.getId(), order.getPartnerId(), order.getActivatedAt(),
                now, reason));
        return order;
    }

    @Transactional(readOnly = true)
    public PartnerOrder load(UUID orderId) {
        return orders.findById(orderId).orElseThrow(() -> new PortalException.NotFound("Order", orderId));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
```

## apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderSite.java

Application: Enterprise Partner Portal. Stack: Java Spring Boot 3 + React. Language: java. Path: `apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal/orders/OrderSite.java`.

```java
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
```

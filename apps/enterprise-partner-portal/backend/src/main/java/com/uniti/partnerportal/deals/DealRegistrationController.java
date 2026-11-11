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

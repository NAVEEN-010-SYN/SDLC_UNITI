package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.PricingPreviewResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteApprovalResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteDecisionRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineResponse;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/quotes")
@Tag(name = "Quotes", description = "Build, price and approve customer quotes")
public class QuoteController {

    public record CustomerDecisionRequest(@NotNull Boolean accepted, @Size(max = 500) String reason) {
    }

    private final QuoteService service;
    private final CurrentUserProvider currentUser;

    public QuoteController(QuoteService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PageResponse<QuoteResponse> search(@RequestParam(required = false) UUID partnerId,
                                              @RequestParam(required = false) QuoteStatus status,
                                              @RequestParam(required = false) UUID dealId,
                                              @RequestParam(required = false) String q,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer pageSize) {
        var result = service.search(partnerId, status, dealId, q, PageResponse.pageable(page, pageSize),
                currentUser.get());
        return PageResponse.from(result, QuoteController::toResponse);
    }

    @GetMapping("/approvals")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Quotes awaiting Uniti approval, oldest first")
    public PageResponse<QuoteResponse> approvalQueue(@RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.ASC, "updatedAt"));
        return PageResponse.from(service.approvalQueue(pageable), QuoteController::toResponse);
    }

    @PostMapping("/preview")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Price a prospective quote without saving it")
    public PricingPreviewResponse preview(@Valid @RequestBody QuoteRequest request) {
        var r = service.preview(request, currentUser.get());
        return new PricingPreviewResponse(r.listMrc().amountMinor(), r.termDiscount().amountMinor(),
                r.volumeDiscount().amountMinor(), r.partnerDiscount().amountMinor(), r.netMrc().amountMinor(),
                r.nrc().amountMinor(), r.nrcWaived(), r.totalContractValue().amountMinor(), r.termDiscountPercent(),
                r.volumeDiscountPercent(), r.effectiveDiscountPercent(), r.selfApprovedAllowancePercent(),
                r.approvalLevel(), r.blockers(), r.listMrc().currency());
    }

    @PostMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public ResponseEntity<QuoteResponse> create(@Valid @RequestBody QuoteRequest request) {
        Quote quote = service.create(request, currentUser.get());
        return ResponseEntity.created(URI.create("/api/v1/quotes/" + quote.getId())).body(toResponse(quote));
    }

    @GetMapping("/{quoteId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse get(@PathVariable UUID quoteId) {
        return toResponse(service.get(quoteId, currentUser.get()));
    }

    @PutMapping("/{quoteId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse update(@PathVariable UUID quoteId, @Valid @RequestBody QuoteRequest request) {
        return toResponse(service.update(quoteId, request, currentUser.get()));
    }

    @PostMapping("/{quoteId}/submit")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Submit for approval", description = "Self-approves within the tier allowance")
    public QuoteResponse submit(@PathVariable UUID quoteId) {
        return toResponse(service.submit(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public QuoteResponse approve(@PathVariable UUID quoteId, @Valid @RequestBody QuoteDecisionRequest request) {
        return toResponse(service.approve(quoteId, request.note(), currentUser.get()));
    }

    @PostMapping("/{quoteId}/reject")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public QuoteResponse reject(@PathVariable UUID quoteId, @Valid @RequestBody QuoteDecisionRequest request) {
        return toResponse(service.reject(quoteId, request.note(), currentUser.get()));
    }

    @PostMapping("/{quoteId}/revise")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Return the quote to draft as a new revision")
    public QuoteResponse revise(@PathVariable UUID quoteId) {
        return toResponse(service.revise(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/send")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public QuoteResponse send(@PathVariable UUID quoteId) {
        return toResponse(service.markSent(quoteId, currentUser.get()));
    }

    @PostMapping("/{quoteId}/customer-decision")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Record the customer's acceptance or refusal")
    public QuoteResponse customerDecision(@PathVariable UUID quoteId,
                                          @Valid @RequestBody CustomerDecisionRequest request) {
        CurrentUser user = currentUser.get();
        return toResponse(service.recordCustomerDecision(quoteId, request.accepted(), request.reason(), user));
    }

    static QuoteResponse toResponse(Quote q) {
        var lines = q.getLines().stream()
                .map(l -> new QuoteLineResponse(l.getId(), l.getLineNo(), l.getSku(), l.getProductName(),
                        l.getSiteName(), l.getSitePostcode(), l.getQuantity(), l.getUnitMrcMinor(),
                        l.getUnitNrcMinor(), l.listMrcMinor(), l.getNetMrcMinor()))
                .toList();
        var approvals = q.getApprovals().stream()
                .map(a -> new QuoteApprovalResponse(a.getRevision(), a.getApprover(), a.getDecision(),
                        a.getDiscountPercent(), a.getNote(), a.getDecidedAt()))
                .toList();
        return new QuoteResponse(q.getId(), q.getReference(), q.getPartnerId(), q.getDealId(), q.getCustomerName(),
                q.getCustomerAccountId(), q.getCustomerContactEmail(), q.getTermMonths(), q.getCurrency(),
                q.getStatus(), q.getRevision(), q.getRequestedDiscountPercent(), q.getEffectiveDiscountPercent(),
                q.getListMrcMinor(), q.getTermDiscountMinor(), q.getVolumeDiscountMinor(),
                q.getPartnerDiscountMinor(), q.getNetMrcMinor(), q.getNrcMinor(), q.isNrcWaived(),
                q.getTotalContractValueMinor(), q.getApprovalLevel(), q.approvalsForCurrentRevision(),
                q.getJustification(), q.getValidUntil(), q.getSentAt(), q.getAcceptedAt(), q.getClosedReason(),
                lines, approvals, q.getCreatedAt());
    }
}

package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycChecklist;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycReviewRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerApplicationRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerProfileUpdateRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerSummary;
import com.uniti.partnerportal.partner.dto.PartnerDtos.StatusChangeRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierEvaluationResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Partners", description = "Onboarding, KYC and partner lifecycle")
public class PartnerController {

    private final PartnerService service;
    private final TierEvaluationService tiers;
    private final PartnerMapper mapper;
    private final CurrentUserProvider currentUser;

    public PartnerController(PartnerService service, TierEvaluationService tiers, PartnerMapper mapper,
                             CurrentUserProvider currentUser) {
        this.service = service;
        this.tiers = tiers;
        this.mapper = mapper;
        this.currentUser = currentUser;
    }

    @PostMapping("/onboarding/applications")
    @Operation(summary = "Apply to the partner programme", description = "Unauthenticated public endpoint")
    public ResponseEntity<PartnerResponse> apply(@Valid @RequestBody PartnerApplicationRequest request) {
        Partner partner = service.apply(request);
        return ResponseEntity.created(URI.create("/api/v1/partners/" + partner.getId()))
                .body(mapper.toResponse(partner));
    }

    @GetMapping("/partners")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Search partners (internal)")
    public PageResponse<PartnerSummary> search(@RequestParam(required = false) PartnerStatus status,
                                               @RequestParam(required = false) PartnerTier tier,
                                               @RequestParam(required = false) String q,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer pageSize) {
        return PageResponse.from(service.search(status, tier, q, PageResponse.pageable(page, pageSize)),
                mapper::toSummary);
    }

    @GetMapping("/partners/me")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "The signed-in user's partner organisation")
    public PartnerResponse me() {
        var user = currentUser.get();
        return mapper.toResponse(service.get(user.requirePartnerId(), user));
    }

    @GetMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public PartnerResponse get(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.get(partnerId, currentUser.get()));
    }

    @PutMapping("/partners/{partnerId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Update contact and address details")
    public PartnerResponse update(@PathVariable UUID partnerId,
                                  @Valid @RequestBody PartnerProfileUpdateRequest request) {
        return mapper.toResponse(service.updateProfile(partnerId, request, currentUser.get()));
    }

    @GetMapping("/partners/{partnerId}/kyc/documents")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public List<KycDocumentResponse> documents(@PathVariable UUID partnerId) {
        return service.get(partnerId, currentUser.get()).getDocuments().stream().map(mapper::toResponse).toList();
    }

    @PostMapping("/partners/{partnerId}/kyc/documents")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Register an uploaded KYC document",
            description = "The file itself is uploaded to object storage first; this records its key and digest")
    public KycDocumentResponse upload(@PathVariable UUID partnerId, @Valid @RequestBody KycDocumentRequest request) {
        return mapper.toResponse(service.uploadDocument(partnerId, request, currentUser.get()));
    }

    @GetMapping("/partners/{partnerId}/kyc/checklist")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public KycChecklist checklist(@PathVariable UUID partnerId) {
        return service.checklist(partnerId, currentUser.get());
    }

    @PostMapping("/partners/{partnerId}/kyc/submit")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Submit KYC for review")
    public PartnerResponse submit(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.submitForReview(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/kyc/documents/{documentId}/review")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Verify or reject a KYC document (internal)")
    public KycDocumentResponse review(@PathVariable UUID partnerId, @PathVariable UUID documentId,
                                      @Valid @RequestBody KycReviewRequest request) {
        return mapper.toResponse(service.reviewDocument(partnerId, documentId, request, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/accept")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Accept an application and open KYC (internal)")
    public PartnerResponse accept(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.acceptApplication(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Activate a partner whose KYC is fully verified (internal)")
    public PartnerResponse approve(@PathVariable UUID partnerId) {
        return mapper.toResponse(service.approve(partnerId, currentUser.get()));
    }

    @PostMapping("/partners/{partnerId}/rework")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse rework(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.returnForRework(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/reject")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse reject(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.reject(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/suspend")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse suspend(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.suspend(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/reinstate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse reinstate(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.reinstate(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/terminate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PartnerResponse terminate(@PathVariable UUID partnerId, @Valid @RequestBody StatusChangeRequest request) {
        return mapper.toResponse(service.terminate(partnerId, request.reason()));
    }

    @PostMapping("/partners/{partnerId}/tier/evaluate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Re-evaluate the partner's tier now (internal)")
    public TierEvaluationResponse evaluateTier(@PathVariable UUID partnerId) {
        return tiers.evaluate(partnerId);
    }
}

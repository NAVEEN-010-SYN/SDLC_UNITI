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

package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import com.uniti.partnerportal.users.dto.UserDtos.CertificationRequest;
import com.uniti.partnerportal.users.dto.UserDtos.InviteUserRequest;
import com.uniti.partnerportal.users.dto.UserDtos.PartnerUserResponse;
import com.uniti.partnerportal.users.dto.UserDtos.SeatUsage;
import com.uniti.partnerportal.users.dto.UserDtos.UpdateUserRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
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

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/partners/{partnerId}/users")
@Tag(name = "Partner users", description = "Portal seats, roles and agent certification")
public class PartnerUserController {

    private final PartnerUserService service;
    private final CurrentUserProvider currentUser;

    public PartnerUserController(PartnerUserService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "List users of a partner")
    public PageResponse<PartnerUserResponse> list(@PathVariable UUID partnerId,
                                                  @RequestParam(required = false) PartnerUser.Status status,
                                                  @RequestParam(required = false) PartnerUser.Role role,
                                                  @RequestParam(required = false) Integer page,
                                                  @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by("lastName", "firstName"));
        return PageResponse.from(service.list(partnerId, status, role, pageable, currentUser.get()),
                service::toResponse);
    }

    @GetMapping("/seats")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Seat usage against the tier limit")
    public SeatUsage seats(@PathVariable UUID partnerId) {
        return service.seatUsage(partnerId, currentUser.get());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Invite a user", description = "Consumes a seat; fails when the tier seat limit is reached")
    public PartnerUserResponse invite(@PathVariable UUID partnerId, @Valid @RequestBody InviteUserRequest request) {
        return service.toResponse(service.invite(partnerId, request, currentUser.get()));
    }

    @PostMapping("/accept-invitation")
    @Operation(summary = "Bind the signed-in identity to a pending invitation")
    public PartnerUserResponse acceptInvitation(@PathVariable UUID partnerId) {
        return service.toResponse(service.acceptInvitation(partnerId, currentUser.get()));
    }

    @PutMapping("/{userId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Update a user's name or role")
    public PartnerUserResponse update(@PathVariable UUID partnerId, @PathVariable UUID userId,
                                      @Valid @RequestBody UpdateUserRequest request) {
        return service.toResponse(service.update(partnerId, userId, request, currentUser.get()));
    }

    @PostMapping("/{userId}/resend-invite")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Resend a pending invitation")
    public PartnerUserResponse resend(@PathVariable UUID partnerId, @PathVariable UUID userId) {
        return service.toResponse(service.resendInvite(partnerId, userId, currentUser.get()));
    }

    @PostMapping("/{userId}/deactivate")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Deactivate a user and release their seat")
    public PartnerUserResponse deactivate(@PathVariable UUID partnerId, @PathVariable UUID userId) {
        return service.toResponse(service.deactivate(partnerId, userId, currentUser.get()));
    }

    @PutMapping("/{userId}/certification")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Record product certification for an agent")
    public PartnerUserResponse certify(@PathVariable UUID partnerId, @PathVariable UUID userId,
                                       @Valid @RequestBody CertificationRequest request) {
        return service.toResponse(service.recordCertification(partnerId, userId, request.certifiedUntil()));
    }
}

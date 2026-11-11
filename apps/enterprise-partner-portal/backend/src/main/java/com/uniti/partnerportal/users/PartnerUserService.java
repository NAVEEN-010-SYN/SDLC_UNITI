package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.partner.PartnerStatus;
import com.uniti.partnerportal.users.dto.UserDtos.InviteUserRequest;
import com.uniti.partnerportal.users.dto.UserDtos.PartnerUserResponse;
import com.uniti.partnerportal.users.dto.UserDtos.SeatUsage;
import com.uniti.partnerportal.users.dto.UserDtos.UpdateUserRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.Locale;
import java.util.UUID;

/**
 * Manages the partner's portal seats. Enforces the tier seat limit, keeps at least one active
 * administrator per partner and prevents users from locking themselves out.
 */
@Service
@Transactional
public class PartnerUserService {

    static final Duration INVITE_TTL = Duration.ofDays(7);
    private static final EnumSet<PartnerUser.Status> SEAT_HOLDING =
            EnumSet.of(PartnerUser.Status.INVITED, PartnerUser.Status.ACTIVE);

    private final PartnerUserRepository users;
    private final PartnerService partners;
    private final Clock clock;

    public PartnerUserService(PartnerUserRepository users, PartnerService partners, Clock clock) {
        this.users = users;
        this.partners = partners;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<PartnerUser> list(UUID partnerId, PartnerUser.Status status, PartnerUser.Role role,
                                  Pageable pageable, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        return users.search(partnerId, status, role, pageable);
    }

    @Transactional(readOnly = true)
    public SeatUsage seatUsage(UUID partnerId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        Partner partner = partners.load(partnerId);
        long used = users.countByPartnerIdAndStatusIn(partnerId, SEAT_HOLDING);
        int limit = partner.getTier().seatLimit();
        return new SeatUsage(limit, used, Math.max(0, limit - used));
    }

    public PartnerUser invite(UUID partnerId, InviteUserRequest request, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        Partner partner = partners.load(partnerId);
        if (partner.getStatus() == PartnerStatus.TERMINATED || partner.getStatus() == PartnerStatus.REJECTED) {
            throw new PortalException.BusinessRule("partner.closed", "Users cannot be added to a closed partner");
        }
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Instant now = Instant.now(clock);
        PartnerUser existing = users.findByPartnerIdAndEmailIgnoreCase(partnerId, email).orElse(null);
        if (existing != null && existing.holdsSeat()) {
            throw new PortalException.Conflict("user.duplicate_email", email + " already has access to this partner");
        }
        assertSeatAvailable(partner);
        if (existing != null) {
            existing.setRole(request.role());
            existing.setFirstName(request.firstName().trim());
            existing.setLastName(request.lastName().trim());
            existing.reinvite(now, now.plus(INVITE_TTL));
            return existing;
        }
        PartnerUser user = new PartnerUser(UUID.randomUUID(), partnerId, email, request.firstName().trim(),
                request.lastName().trim(), request.role(), now, now.plus(INVITE_TTL));
        return users.save(user);
    }

    public PartnerUser resendInvite(UUID partnerId, UUID userId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() != PartnerUser.Status.INVITED) {
            throw new PortalException.BusinessRule("user.not_invited", "Only pending invitations can be resent");
        }
        Instant now = Instant.now(clock);
        user.reinvite(now, now.plus(INVITE_TTL));
        return user;
    }

    /**
     * Called on first sign-in: binds the IdP subject to the invitation if it is still valid.
     */
    public PartnerUser acceptInvitation(UUID partnerId, CurrentUser caller) {
        PartnerUser user = users.findByPartnerIdAndEmailIgnoreCase(partnerId, caller.email())
                .orElseThrow(() -> new PortalException.NotFound("Invitation", caller.email()));
        Instant now = Instant.now(clock);
        if (user.getStatus() == PartnerUser.Status.ACTIVE) {
            user.setLastLoginAt(now);
            return user;
        }
        if (user.getStatus() != PartnerUser.Status.INVITED) {
            throw new PortalException.Forbidden("This account has been deactivated");
        }
        if (user.getInviteExpiresAt().isBefore(now)) {
            throw new PortalException.BusinessRule("user.invite_expired",
                    "The invitation has expired; ask your administrator to resend it");
        }
        user.activate(caller.subject(), now);
        return user;
    }

    public PartnerUser update(UUID partnerId, UUID userId, UpdateUserRequest request, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getRole() == PartnerUser.Role.PARTNER_ADMIN && request.role() != PartnerUser.Role.PARTNER_ADMIN) {
            if (caller.subject().equals(user.getIdpSubject())) {
                throw new PortalException.BusinessRule("user.self_demotion", "You cannot remove your own admin role");
            }
            assertNotLastAdmin(user);
        }
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setRole(request.role());
        return user;
    }

    public PartnerUser deactivate(UUID partnerId, UUID userId, CurrentUser caller) {
        caller.assertCanAccess(partnerId);
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() == PartnerUser.Status.DEACTIVATED) {
            return user;
        }
        if (caller.subject().equals(user.getIdpSubject())) {
            throw new PortalException.BusinessRule("user.self_deactivation", "You cannot deactivate yourself");
        }
        if (user.getRole() == PartnerUser.Role.PARTNER_ADMIN) {
            assertNotLastAdmin(user);
        }
        user.deactivate(Instant.now(clock));
        return user;
    }

    public PartnerUser recordCertification(UUID partnerId, UUID userId, LocalDate certifiedUntil) {
        PartnerUser user = load(partnerId, userId);
        if (user.getStatus() == PartnerUser.Status.DEACTIVATED) {
            throw new PortalException.BusinessRule("user.deactivated", "Cannot certify a deactivated user");
        }
        user.setCertifiedUntil(certifiedUntil);
        return user;
    }

    @Transactional(readOnly = true)
    public int certifiedAgentCount(UUID partnerId) {
        return users.countCertifiedActive(partnerId, LocalDate.now(clock));
    }

    public PartnerUserResponse toResponse(PartnerUser u) {
        return new PartnerUserResponse(u.getId(), u.getPartnerId(), u.getEmail(), u.getFirstName(),
                u.getLastName(), u.getRole(), u.getStatus(), u.isCertified(LocalDate.now(clock)),
                u.getCertifiedUntil(), u.getInvitedAt(), u.getInviteExpiresAt(), u.getLastLoginAt());
    }

    private void assertSeatAvailable(Partner partner) {
        long used = users.countByPartnerIdAndStatusIn(partner.getId(), SEAT_HOLDING);
        if (used >= partner.getTier().seatLimit()) {
            throw new PortalException.BusinessRule("user.seat_limit",
                    "The " + partner.getTier() + " tier allows " + partner.getTier().seatLimit()
                            + " users; deactivate a user or progress to a higher tier");
        }
    }

    private void assertNotLastAdmin(PartnerUser user) {
        long activeAdmins = users.countByPartnerIdAndRoleAndStatus(user.getPartnerId(),
                PartnerUser.Role.PARTNER_ADMIN, PartnerUser.Status.ACTIVE);
        boolean userIsActiveAdmin = user.getStatus() == PartnerUser.Status.ACTIVE;
        if (userIsActiveAdmin && activeAdmins <= 1) {
            throw new PortalException.BusinessRule("user.last_admin",
                    "A partner must keep at least one active administrator");
        }
    }

    private PartnerUser load(UUID partnerId, UUID userId) {
        return users.findByIdAndPartnerId(userId, partnerId)
                .orElseThrow(() -> new PortalException.NotFound("PartnerUser", userId));
    }
}

package com.uniti.partnerportal.common.security;

import com.uniti.partnerportal.common.error.PortalException;

import java.util.Set;
import java.util.UUID;

/**
 * The authenticated caller, derived from the bearer JWT. Partner users are always bound to a
 * single partner organisation; internal Uniti users ({@code CHANNEL_MANAGER}, {@code SUPPORT_AGENT})
 * have no partner binding and may act across partners.
 */
public record CurrentUser(String subject, String email, String displayName, UUID partnerId, Set<String> roles) {

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    public boolean isInternal() {
        return hasRole(Roles.CHANNEL_MANAGER) || hasRole(Roles.SUPPORT_AGENT);
    }

    public boolean isPartnerAdmin() {
        return hasRole(Roles.PARTNER_ADMIN);
    }

    /**
     * Returns the caller's partner, failing for internal users who must address a partner
     * explicitly.
     */
    public UUID requirePartnerId() {
        if (partnerId == null) {
            throw new PortalException.Forbidden("This action requires a partner-scoped user");
        }
        return partnerId;
    }

    /**
     * Resolves which partner a request acts on: partner users are pinned to their own partner
     * regardless of what they ask for; internal users must name one.
     */
    public UUID effectivePartner(UUID requested) {
        if (isInternal()) {
            if (requested == null) {
                throw new PortalException.BusinessRule("partner.required",
                        "Internal users must specify the partnerId to act on");
            }
            return requested;
        }
        UUID own = requirePartnerId();
        if (requested != null && !requested.equals(own)) {
            throw new PortalException.Forbidden("You may only act on your own partner organisation");
        }
        return own;
    }

    public void assertCanAccess(UUID ownerPartnerId) {
        if (isInternal()) {
            return;
        }
        if (partnerId == null || !partnerId.equals(ownerPartnerId)) {
            throw new PortalException.Forbidden("This record belongs to another partner");
        }
    }
}

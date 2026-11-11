package com.uniti.partnerportal.common.security;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.error.PortalException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Builds the {@link CurrentUser} for the active request from the JWT held in the security
 * context. Kept as a component (rather than a static helper) so services can be unit tested with
 * a mocked provider.
 */
@Component
public class CurrentUserProvider {

    private final PortalProperties properties;

    public CurrentUserProvider(PortalProperties properties) {
        this.properties = properties;
    }

    public CurrentUser get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken token)) {
            throw new PortalException.Forbidden("No authenticated user");
        }
        return fromJwt(token.getToken());
    }

    public CurrentUser fromJwt(Jwt jwt) {
        String partnerClaim = jwt.getClaimAsString(properties.security().partnerClaim());
        UUID partnerId = parsePartner(partnerClaim);
        Set<String> roles = extractRoles(jwt, properties.security().rolesClaim());
        String email = jwt.getClaimAsString("email");
        String name = jwt.getClaimAsString("name");
        return new CurrentUser(jwt.getSubject(), email, name == null ? email : name, partnerId, roles);
    }

    static Set<String> extractRoles(Jwt jwt, String claim) {
        Object raw = jwt.getClaims().get(claim);
        Set<String> roles = new HashSet<>();
        if (raw instanceof Collection<?> values) {
            values.forEach(v -> roles.add(String.valueOf(v).toUpperCase()));
        } else if (raw instanceof String value) {
            for (String part : value.split("[ ,]")) {
                if (!part.isBlank()) {
                    roles.add(part.trim().toUpperCase());
                }
            }
        }
        return roles;
    }

    private static UUID parsePartner(String claim) {
        if (claim == null || claim.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(claim);
        } catch (IllegalArgumentException ex) {
            throw new PortalException.Forbidden("Token carries a malformed partner identifier");
        }
    }
}

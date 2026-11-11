package com.uniti.partnerportal.users;

import com.uniti.partnerportal.common.domain.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A person at a partner organisation who uses the portal. Identity lives in the IdP; this
 * record holds the programme-specific facts (role, seat, certification).
 */
@Entity
@Table(name = "partner_user")
public class PartnerUser extends AuditableEntity {

    public enum Role { PARTNER_ADMIN, PARTNER_AGENT }

    public enum Status { INVITED, ACTIVE, DEACTIVATED }

    @Id
    private UUID id;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(nullable = false, length = 200)
    private String email;

    @Column(name = "first_name", nullable = false, length = 80)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 80)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "idp_subject", length = 120)
    private String idpSubject;

    @Column(name = "certified_until")
    private LocalDate certifiedUntil;

    @Column(name = "invited_at", nullable = false)
    private Instant invitedAt;

    @Column(name = "invite_expires_at", nullable = false)
    private Instant inviteExpiresAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "deactivated_at")
    private Instant deactivatedAt;

    protected PartnerUser() {
    }

    public PartnerUser(UUID id, UUID partnerId, String email, String firstName, String lastName, Role role,
                       Instant invitedAt, Instant inviteExpiresAt) {
        this.id = id;
        this.partnerId = partnerId;
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName;
        this.role = role;
        this.status = Status.INVITED;
        this.invitedAt = invitedAt;
        this.inviteExpiresAt = inviteExpiresAt;
    }

    public boolean isCertified(LocalDate today) {
        return certifiedUntil != null && !certifiedUntil.isBefore(today);
    }

    public boolean holdsSeat() {
        return status != Status.DEACTIVATED;
    }

    public void activate(String subject, Instant at) {
        this.status = Status.ACTIVE;
        this.idpSubject = subject;
        this.lastLoginAt = at;
    }

    public void deactivate(Instant at) {
        this.status = Status.DEACTIVATED;
        this.deactivatedAt = at;
    }

    public void reinvite(Instant at, Instant expiresAt) {
        this.status = Status.INVITED;
        this.invitedAt = at;
        this.inviteExpiresAt = expiresAt;
        this.deactivatedAt = null;
    }

    public String fullName() {
        return firstName + " " + lastName;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPartnerId() {
        return partnerId;
    }

    public String getEmail() {
        return email;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public Status getStatus() {
        return status;
    }

    public String getIdpSubject() {
        return idpSubject;
    }

    public LocalDate getCertifiedUntil() {
        return certifiedUntil;
    }

    public void setCertifiedUntil(LocalDate certifiedUntil) {
        this.certifiedUntil = certifiedUntil;
    }

    public Instant getInvitedAt() {
        return invitedAt;
    }

    public Instant getInviteExpiresAt() {
        return inviteExpiresAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public Instant getDeactivatedAt() {
        return deactivatedAt;
    }
}

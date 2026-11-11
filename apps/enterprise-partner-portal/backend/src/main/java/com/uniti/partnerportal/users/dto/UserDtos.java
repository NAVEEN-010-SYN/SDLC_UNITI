package com.uniti.partnerportal.users.dto;

import com.uniti.partnerportal.users.PartnerUser;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {
    }

    public record InviteUserRequest(
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull PartnerUser.Role role) {
    }

    public record UpdateUserRequest(
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull PartnerUser.Role role) {
    }

    public record CertificationRequest(@NotNull @Future LocalDate certifiedUntil) {
    }

    public record PartnerUserResponse(
            UUID id,
            UUID partnerId,
            String email,
            String firstName,
            String lastName,
            PartnerUser.Role role,
            PartnerUser.Status status,
            boolean certified,
            LocalDate certifiedUntil,
            Instant invitedAt,
            Instant inviteExpiresAt,
            Instant lastLoginAt) {
    }

    public record SeatUsage(int seatLimit, long seatsUsed, long seatsAvailable) {
    }
}

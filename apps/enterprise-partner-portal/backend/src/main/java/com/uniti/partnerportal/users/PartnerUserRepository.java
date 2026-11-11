package com.uniti.partnerportal.users;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface PartnerUserRepository extends JpaRepository<PartnerUser, UUID> {

    Optional<PartnerUser> findByPartnerIdAndEmailIgnoreCase(UUID partnerId, String email);

    Optional<PartnerUser> findByIdAndPartnerId(UUID id, UUID partnerId);

    Optional<PartnerUser> findByIdpSubject(String idpSubject);

    long countByPartnerIdAndStatusIn(UUID partnerId, Collection<PartnerUser.Status> statuses);

    long countByPartnerIdAndRoleAndStatus(UUID partnerId, PartnerUser.Role role, PartnerUser.Status status);

    @Query("""
            SELECT COUNT(u) FROM PartnerUser u
            WHERE u.partnerId = :partnerId
              AND u.status = com.uniti.partnerportal.users.PartnerUser.Status.ACTIVE
              AND u.certifiedUntil >= :today
            """)
    int countCertifiedActive(@Param("partnerId") UUID partnerId, @Param("today") LocalDate today);

    @Query("""
            SELECT u FROM PartnerUser u
            WHERE u.partnerId = :partnerId
              AND (:status IS NULL OR u.status = :status)
              AND (:role IS NULL OR u.role = :role)
            """)
    Page<PartnerUser> search(@Param("partnerId") UUID partnerId,
                             @Param("status") PartnerUser.Status status,
                             @Param("role") PartnerUser.Role role,
                             Pageable pageable);
}

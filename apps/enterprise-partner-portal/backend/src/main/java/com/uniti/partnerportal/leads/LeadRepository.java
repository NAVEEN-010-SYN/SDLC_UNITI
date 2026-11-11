package com.uniti.partnerportal.leads;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface LeadRepository extends JpaRepository<Lead, UUID> {

    @Query("""
            SELECT l FROM Lead l
            WHERE l.partnerId = :partnerId
              AND (:status IS NULL OR l.status = :status)
              AND (:owner IS NULL OR l.ownerSubject = :owner)
              AND (:minScore IS NULL OR l.score >= :minScore)
              AND (:search IS NULL
                   OR LOWER(l.companyName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(l.contactName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR l.reference = :search)
            """)
    Page<Lead> search(@Param("partnerId") UUID partnerId,
                      @Param("status") Lead.Status status,
                      @Param("owner") String owner,
                      @Param("minScore") Integer minScore,
                      @Param("search") String search,
                      Pageable pageable);

    @Query("""
            SELECT l FROM Lead l
            WHERE l.partnerId = :partnerId
              AND l.status IN (com.uniti.partnerportal.leads.Lead.Status.NEW,
                               com.uniti.partnerportal.leads.Lead.Status.CONTACTED,
                               com.uniti.partnerportal.leads.Lead.Status.QUALIFIED)
              AND l.nextActionAt < :now
            ORDER BY l.nextActionAt
            """)
    List<Lead> findOverdue(@Param("partnerId") UUID partnerId, @Param("now") Instant now);

    long countByPartnerIdAndStatus(UUID partnerId, Lead.Status status);

    long countByPartnerIdAndCreatedAtAfter(UUID partnerId, Instant since);
}

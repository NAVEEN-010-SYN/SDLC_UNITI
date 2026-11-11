package com.uniti.partnerportal.deals;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DealRegistrationRepository extends JpaRepository<DealRegistration, UUID> {

    /**
     * Candidate claims for conflict detection: any open registration that shares a postcode
     * district, customer domain, company number or exact normalised name. Fuzzy name scoring
     * then happens in memory on this narrowed set.
     */
    @Query("""
            SELECT d FROM DealRegistration d
            WHERE d.status IN :statuses
              AND d.id <> :excludeId
              AND (d.outwardCode = :outwardCode
                   OR (:domain IS NOT NULL AND d.customerDomain = :domain)
                   OR (:companyNumber IS NOT NULL AND d.customerCompanyNumber = :companyNumber)
                   OR d.normalisedName = :normalisedName)
            """)
    List<DealRegistration> findConflictCandidates(@Param("statuses") Collection<DealStatus> statuses,
                                                  @Param("excludeId") UUID excludeId,
                                                  @Param("outwardCode") String outwardCode,
                                                  @Param("domain") String domain,
                                                  @Param("companyNumber") String companyNumber,
                                                  @Param("normalisedName") String normalisedName);

    @Query("""
            SELECT d FROM DealRegistration d
            WHERE (:partnerId IS NULL OR d.partnerId = :partnerId)
              AND (:status IS NULL OR d.status = :status)
              AND (:conflictOnly = false OR d.hasConflict = true)
              AND (:search IS NULL
                   OR LOWER(d.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR d.reference = :search)
            """)
    Page<DealRegistration> search(@Param("partnerId") UUID partnerId,
                                  @Param("status") DealStatus status,
                                  @Param("conflictOnly") boolean conflictOnly,
                                  @Param("search") String search,
                                  Pageable pageable);

    List<DealRegistration> findByStatusAndProtectedUntilBefore(DealStatus status, LocalDate date);

    List<DealRegistration> findByPartnerIdAndStatusIn(UUID partnerId, Collection<DealStatus> statuses);

    @Query("""
            SELECT d.status AS status, COUNT(d) AS count, COALESCE(SUM(d.estimatedMrcMinor), 0) AS mrc
            FROM DealRegistration d
            WHERE d.partnerId = :partnerId AND d.submittedAt >= :since
            GROUP BY d.status
            """)
    List<StatusRollup> rollupByStatus(@Param("partnerId") UUID partnerId, @Param("since") java.time.Instant since);

    interface StatusRollup {
        DealStatus getStatus();

        long getCount();

        long getMrc();
    }
}

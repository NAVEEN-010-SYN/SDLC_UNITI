package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface CommissionPayoutRepository extends JpaRepository<CommissionPayout, UUID> {

    Optional<CommissionPayout> findByStatementId(UUID statementId);

    @Query("""
            SELECT p FROM CommissionPayout p
            WHERE (:partnerId IS NULL OR p.partnerId = :partnerId)
              AND (:status IS NULL OR p.status = :status)
            """)
    Page<CommissionPayout> search(@Param("partnerId") UUID partnerId,
                                  @Param("status") CommissionPayout.Status status,
                                  Pageable pageable);

    @Query("""
            SELECT COALESCE(SUM(p.amountMinor), 0) FROM CommissionPayout p
            WHERE p.partnerId = :partnerId
              AND p.status = com.uniti.partnerportal.commissions.CommissionPayout.Status.PAID
              AND p.paidAt >= :since
            """)
    long sumPaidSince(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    @Query("""
            SELECT COALESCE(SUM(p.amountMinor), 0) FROM CommissionPayout p
            WHERE p.partnerId = :partnerId
              AND p.status <> com.uniti.partnerportal.commissions.CommissionPayout.Status.PAID
            """)
    long sumOutstanding(@Param("partnerId") UUID partnerId);
}

package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionStatementRepository extends JpaRepository<CommissionStatement, UUID> {

    boolean existsByPartnerIdAndPeriodStart(UUID partnerId, LocalDate periodStart);

    List<CommissionStatement> findByPartnerIdAndStatusAndCarriedIntoStatementIdIsNull(UUID partnerId,
                                                                                     StatementStatus status);

    @Query("""
            SELECT s FROM CommissionStatement s
            WHERE (:partnerId IS NULL OR s.partnerId = :partnerId)
              AND (:status IS NULL OR s.status = :status)
            """)
    Page<CommissionStatement> search(@Param("partnerId") UUID partnerId,
                                     @Param("status") StatementStatus status,
                                     Pageable pageable);
}

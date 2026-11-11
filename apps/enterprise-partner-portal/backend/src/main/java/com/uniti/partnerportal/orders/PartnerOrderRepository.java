package com.uniti.partnerportal.orders;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerOrderRepository extends JpaRepository<PartnerOrder, UUID> {

    Optional<PartnerOrder> findByQuoteId(UUID quoteId);

    @Query("""
            SELECT o FROM PartnerOrder o
            WHERE (:partnerId IS NULL OR o.partnerId = :partnerId)
              AND (:status IS NULL OR o.status = :status)
              AND (:search IS NULL
                   OR LOWER(o.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR o.reference = :search
                   OR o.customerAccountId = :search)
            """)
    Page<PartnerOrder> search(@Param("partnerId") UUID partnerId,
                              @Param("status") OrderStatus status,
                              @Param("search") String search,
                              Pageable pageable);

    /**
     * Monthly recurring revenue of orders that went live in the window and have not since been
     * ceased; the basis of trailing-revenue tier evaluation.
     */
    @Query("""
            SELECT COALESCE(SUM(o.monthlyRecurringMinor), 0) FROM PartnerOrder o
            WHERE o.partnerId = :partnerId
              AND o.status = com.uniti.partnerportal.orders.OrderStatus.ACTIVE
              AND o.activatedAt >= :since
              AND o.ceasedAt IS NULL
            """)
    long sumActivatedMonthlyRecurring(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    @Query("""
            SELECT o.status AS status, COUNT(o) AS count, COALESCE(SUM(o.monthlyRecurringMinor), 0) AS mrc
            FROM PartnerOrder o
            WHERE o.partnerId = :partnerId AND o.createdAt >= :since
            GROUP BY o.status
            """)
    List<StatusRollup> rollupByStatus(@Param("partnerId") UUID partnerId, @Param("since") Instant since);

    interface StatusRollup {
        OrderStatus getStatus();

        long getCount();

        long getMrc();
    }
}

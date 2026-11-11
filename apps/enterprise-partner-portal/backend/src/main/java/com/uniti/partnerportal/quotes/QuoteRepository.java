package com.uniti.partnerportal.quotes;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface QuoteRepository extends JpaRepository<Quote, UUID> {

    @Query("""
            SELECT q FROM Quote q
            WHERE (:partnerId IS NULL OR q.partnerId = :partnerId)
              AND (:status IS NULL OR q.status = :status)
              AND (:dealId IS NULL OR q.dealId = :dealId)
              AND (:search IS NULL
                   OR LOWER(q.customerName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR q.reference = :search)
            """)
    Page<Quote> search(@Param("partnerId") UUID partnerId,
                       @Param("status") QuoteStatus status,
                       @Param("dealId") UUID dealId,
                       @Param("search") String search,
                       Pageable pageable);

    Page<Quote> findByStatus(QuoteStatus status, Pageable pageable);

    List<Quote> findByStatusInAndValidUntilBefore(Collection<QuoteStatus> statuses, Instant cutoff);

    long countByPartnerIdAndStatusInAndCreatedAtAfter(UUID partnerId, Collection<QuoteStatus> statuses,
                                                      Instant since);

    long countByPartnerIdAndCreatedAtAfter(UUID partnerId, Instant since);
}

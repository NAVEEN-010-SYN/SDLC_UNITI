package com.uniti.partnerportal.commissions;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionEntryRepository extends JpaRepository<CommissionEntry, UUID> {

    boolean existsByOrderIdAndType(UUID orderId, CommissionEntry.Type type);

    List<CommissionEntry> findByOrderIdAndType(UUID orderId, CommissionEntry.Type type);

    List<CommissionEntry> findByStatementIdOrderByEarnedOnAscCreatedAtAsc(UUID statementId);

    List<CommissionEntry> findByPartnerIdAndStatementIdIsNullAndEarnedOnLessThanEqual(UUID partnerId,
                                                                                     LocalDate cutoff);

    @Query("""
            SELECT DISTINCT e.partnerId FROM CommissionEntry e
            WHERE e.statementId IS NULL AND e.earnedOn <= :cutoff
            """)
    List<UUID> findPartnersWithUnbilledEntries(@Param("cutoff") LocalDate cutoff);

    @Query("""
            SELECT COALESCE(SUM(e.amountMinor), 0) FROM CommissionEntry e
            WHERE e.partnerId = :partnerId AND e.earnedOn BETWEEN :from AND :to
            """)
    long sumEarned(@Param("partnerId") UUID partnerId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            SELECT COALESCE(SUM(e.amountMinor), 0) FROM CommissionEntry e
            WHERE e.partnerId = :partnerId AND e.statementId IS NULL
            """)
    long sumUnbilled(@Param("partnerId") UUID partnerId);
}

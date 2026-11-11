package com.uniti.partnerportal.commissions;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface CommissionRuleRepository extends JpaRepository<CommissionRule, UUID> {

    @Query("""
            SELECT r FROM CommissionRule r
            WHERE r.active = true
              AND r.validFrom <= :date
              AND (r.validTo IS NULL OR r.validTo >= :date)
            ORDER BY r.name
            """)
    List<CommissionRule> findEffectiveOn(@Param("date") LocalDate date);

    Page<CommissionRule> findByActive(boolean active, Pageable pageable);
}

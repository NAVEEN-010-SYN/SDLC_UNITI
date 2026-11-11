package com.uniti.partnerportal.partner;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PartnerRepository extends JpaRepository<Partner, UUID> {

    Optional<Partner> findByReference(String reference);

    boolean existsByCompanyNumberIgnoreCaseAndStatusIn(String companyNumber, Collection<PartnerStatus> statuses);

    List<Partner> findByStatus(PartnerStatus status);

    @Query("""
            SELECT p FROM Partner p
            WHERE (:status IS NULL OR p.status = :status)
              AND (:tier IS NULL OR p.tier = :tier)
              AND (:search IS NULL
                   OR LOWER(p.legalName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(p.tradingName) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR p.reference = :search)
            """)
    Page<Partner> search(@Param("status") PartnerStatus status,
                         @Param("tier") PartnerTier tier,
                         @Param("search") String search,
                         Pageable pageable);
}

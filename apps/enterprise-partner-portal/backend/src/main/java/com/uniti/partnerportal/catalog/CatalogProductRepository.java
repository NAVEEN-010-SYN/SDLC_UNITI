package com.uniti.partnerportal.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CatalogProductRepository extends JpaRepository<CatalogProduct, UUID> {

    List<CatalogProduct> findByActiveTrue();

    Optional<CatalogProduct> findBySku(String sku);

    List<CatalogProduct> findBySkuIn(Collection<String> skus);
}

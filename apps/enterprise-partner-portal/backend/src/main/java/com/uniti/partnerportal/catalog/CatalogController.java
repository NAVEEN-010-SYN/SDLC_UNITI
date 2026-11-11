package com.uniti.partnerportal.catalog;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/catalog")
@Tag(name = "Catalog", description = "Products available to sell through the channel")
public class CatalogController {

    /**
     * Partners see list prices and minimum terms. Floor prices are commercially sensitive and are
     * exposed only to internal users.
     */
    public record ProductResponse(UUID id, String sku, String name, CatalogProduct.Category category,
                                  Integer bandwidthMbps, long monthlyPriceMinor, long installPriceMinor,
                                  int minTermMonths, boolean perSite, String currency) {

        static ProductResponse from(CatalogProduct p) {
            return new ProductResponse(p.getId(), p.getSku(), p.getName(), p.getCategory(), p.getBandwidthMbps(),
                    p.getMonthlyPriceMinor(), p.getInstallPriceMinor(), p.getMinTermMonths(), p.isPerSite(),
                    p.getCurrency());
        }
    }

    private final CatalogProductRepository products;

    public CatalogController(CatalogProductRepository products) {
        this.products = products;
    }

    @GetMapping("/products")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "List active products")
    public List<ProductResponse> list(@RequestParam(required = false) CatalogProduct.Category category) {
        return products.findByActiveTrue().stream()
                .filter(p -> category == null || p.getCategory() == category)
                .sorted(Comparator.comparing(CatalogProduct::getCategory)
                        .thenComparing(p -> p.getBandwidthMbps() == null ? 0 : p.getBandwidthMbps())
                        .thenComparing(CatalogProduct::getSku))
                .map(ProductResponse::from)
                .toList();
    }

    @GetMapping("/products/{sku}")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    public ProductResponse get(@PathVariable String sku) {
        return products.findBySku(sku)
                .filter(CatalogProduct::isActive)
                .map(ProductResponse::from)
                .orElseThrow(() -> new PortalException.NotFound("Product", sku));
    }
}

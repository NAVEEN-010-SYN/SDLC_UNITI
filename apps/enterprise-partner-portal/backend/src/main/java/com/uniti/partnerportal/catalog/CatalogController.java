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

import java.util.ArrayList;
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
        List<CatalogProduct> matching = new ArrayList<>();
        for (CatalogProduct p : products.findByActiveTrue()) {
            if (category == null || p.getCategory() == category) {
                matching.add(p);
            }
        }
        matching.sort(CatalogController::compareProducts);
        List<ProductResponse> result = new ArrayList<>();
        for (CatalogProduct p : matching) {
            result.add(ProductResponse.from(p));
        }
        return result;
    }

    /** Orders by category, then bandwidth (missing counts as 0), then SKU. */
    private static int compareProducts(CatalogProduct a, CatalogProduct b) {
        int byCategory = a.getCategory().compareTo(b.getCategory());
        if (byCategory != 0) {
            return byCategory;
        }
        int byBandwidth = Integer.compare(bandwidthOrZero(a), bandwidthOrZero(b));
        if (byBandwidth != 0) {
            return byBandwidth;
        }
        return a.getSku().compareTo(b.getSku());
    }

    private static int bandwidthOrZero(CatalogProduct p) {
        return p.getBandwidthMbps() == null ? 0 : p.getBandwidthMbps();
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

package com.uniti.partnerportal.dashboard;

import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dashboard")
@Tag(name = "Dashboard", description = "Pipeline KPIs")
public class DashboardController {

    private final DashboardService service;
    private final CurrentUserProvider currentUser;

    public DashboardController(DashboardService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping("/pipeline")
    @PreAuthorize(Roles.HAS_PARTNER_ROLE)
    @Operation(summary = "Lead, deal, quote and order KPIs over a trailing window")
    public PipelineKpis pipeline(@RequestParam(required = false) UUID partnerId,
                                 @RequestParam(defaultValue = "90") int days) {
        return service.pipeline(partnerId, days, currentUser.get());
    }
}

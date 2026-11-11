package com.uniti.partnerportal.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Clock;
import java.util.Optional;

/**
 * Cross-cutting beans: a UTC clock (injected everywhere time matters so tests can freeze it),
 * the JPA auditor and the OpenAPI document metadata.
 */
@Configuration
public class PlatformConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    AuditorAware<String> auditorAware() {
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()) {
                return Optional.of("system");
            }
            return Optional.ofNullable(auth.getName());
        };
    }

    @Bean
    OpenAPI partnerPortalOpenApi() {
        String scheme = "bearer-jwt";
        return new OpenAPI()
                .info(new Info()
                        .title("Uniti Enterprise Partner Portal API")
                        .version("v1")
                        .description("Partner onboarding & KYC, lead and deal registration, quoting, "
                                + "ordering on behalf of customers, commissions, MDF and support cases."))
                .addSecurityItem(new SecurityRequirement().addList(scheme))
                .components(new Components().addSecuritySchemes(scheme, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")));
    }
}

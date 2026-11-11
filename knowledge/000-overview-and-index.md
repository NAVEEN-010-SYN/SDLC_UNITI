# Uniti self-care platform: overview and document index

This is a Markdown edition of the Uniti self-care platform monorepo, prepared for knowledge ingestion.
Every source file appears verbatim in a fenced code block, under a heading with its repository path.

## Uniti Self-Care Platform

Monorepo for the B2B, B2C and Partner self-care portals (Development & Support).
Each application lives in its own folder under `apps/`, built in the tech stack its
team owns. Cross-cutting quality, analytics, observability and design assets live
under `qa/`, `data/`, `observability/` and `design/`.

## Layout

| Folder | Application | Stack | Audience |
|---|---|---|---|
| `apps/ecom-gokinetic` | eCom (GoKinetic, Business GoKinetic) storefront & checkout | MERN (MongoDB, Express, React, Node.js) | B2C + B2B |
| `apps/uconnect` | Uconnect account & service management | .NET 8 full stack (ASP.NET Core Web API, EF Core, Razor UI) | B2C + B2B |
| `apps/gokinetic-business` | Go Kinetic Business self-care | Angular full stack (Angular 17 + Node/Express API) | B2B |
| `apps/gokinetic-consumer-ios` | Go Kinetic Consumer mobile app | Swift / SwiftUI | B2C |
| `apps/enterprise-partner-portal` | Enterprise Partner Portal | Java full stack (Spring Boot 3 + React UI) | Partners |
| `apps/sdwan-portal` | SD-WAN management (VeloCloud & Fortinet) | Node.js (TypeScript) API + React UI | B2B |
| `apps/hosted-services` | Hosted Services (hosted voice, email, web hosting) | PHP 8 (Laravel-style) | B2B |
| `apps/iconnect-wholesale` | iConnect Wholesale ordering | .NET 8 Web API + Angular UI | Wholesale partners |
| `apps/chatbot` | Customer support chatbot | Node.js (Express, TypeScript) | All |
| `apps/portal-support` | Marketing/support content: WordPress plugin + Contentful CMS | PHP (WordPress), Node.js | All |
| `apps/uce` | UCE – Unified Customer Experience shell (referrals via SaaSquatch, MS Clarity, FullStory) | React (TypeScript) | All |
| `qa/` | Playwright, Selenium (Java), Postman collections, Swagger/OpenAPI specs | — | — |
| `data/` | Snowflake warehouse models & analytics | SQL / Snowflake | — |
| `observability/` | Dynatrace, Kibana dashboards, alerting | JSON / YAML | — |
| `design/` | Figma design tokens & export scripts | JSON / Node.js | — |

## Shared conventions

See [CONVENTIONS.md](CONVENTIONS.md).

## Engineering Conventions

These apply to every application in the monorepo.

### Domain vocabulary
- **Account** – billing entity (consumer household or business). IDs: `ACC-########`.
- **Customer / User** – a person who logs in. Roles: `CONSUMER`, `BUSINESS_ADMIN`, `BUSINESS_USER`, `PARTNER_ADMIN`, `PARTNER_AGENT`, `WHOLESALE_BUYER`, `SUPPORT_AGENT`.
- **Product / Plan** – fibre broadband tiers (e.g. 100 Mbps, 500 Mbps, 1 Gbps, 2 Gbps), voice, SD-WAN, hosted services.
- **Order** – lifecycle `DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE` (or `CANCELLED`/`FAILED`).
- **Service** – an active product instance on an account, tied to a service address.
- **Ticket** – support case, priority `P1..P4`, status `OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED`.
- **Invoice / Payment** – monthly billing; amounts are integer minor units (cents) + ISO currency.

### Code quality
- Layered architecture: controllers/routes → services (business logic) → repositories/clients (I/O).
- Validate every input at the boundary; return RFC 7807 `application/problem+json` errors from APIs.
- No secrets in code: read from environment variables / config; provide `.env.example`.
- Structured JSON logging with a correlation ID (`X-Correlation-Id` header) propagated across calls.
- Unit tests next to each module for business logic.
- Money is never a floating-point type.
- Dates are ISO-8601 UTC on the wire.

### API
- REST, versioned under `/api/v1`.
- Pagination: `?page=&pageSize=` returning `{ items, page, pageSize, total }`.
- Auth: OAuth2/OIDC bearer JWT; roles enforced server-side.

## Document index

| Document | Covers | Files | Lines |
|---|---|---|---|
| 001-apps-ecom-gokinetic-client-part1.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/client (part 1 of 8) | 26 | 1895 |
| 002-apps-ecom-gokinetic-part2.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic (part 2 of 8) | 18 | 1979 |
| 003-apps-ecom-gokinetic-server-src-part3.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 3 of 8) | 18 | 1740 |
| 004-apps-ecom-gokinetic-server-src-part4.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 4 of 8) | 17 | 1992 |
| 005-apps-ecom-gokinetic-server-src-part5.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 5 of 8) | 31 | 1970 |
| 006-apps-ecom-gokinetic-server-src-part6.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 6 of 8) | 14 | 1972 |
| 007-apps-ecom-gokinetic-server-part7.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server (part 7 of 8) | 11 | 1985 |
| 008-apps-ecom-gokinetic-server-tests-support-part8.md | eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/tests/support (part 8 of 8) | 1 | 94 |
| 009-apps-uconnect-part1.md | Uconnect account & service management: apps/uconnect (part 1 of 8) | 22 | 1888 |
| 010-apps-uconnect-src-uconnect-application-part2.md | Uconnect account & service management: apps/uconnect/src/Uconnect.Application (part 2 of 8) | 19 | 1931 |
| 011-apps-uconnect-src-uconnect-application-part3.md | Uconnect account & service management: apps/uconnect/src/Uconnect.Application (part 3 of 8) | 13 | 1876 |
| 012-apps-uconnect-src-part4.md | Uconnect account & service management: apps/uconnect/src (part 4 of 8) | 12 | 1958 |
| 013-apps-uconnect-src-uconnect-domain-part5.md | Uconnect account & service management: apps/uconnect/src/Uconnect.Domain (part 5 of 8) | 14 | 1853 |
| 014-apps-uconnect-src-part6.md | Uconnect account & service management: apps/uconnect/src (part 6 of 8) | 15 | 1865 |
| 015-apps-uconnect-src-part7.md | Uconnect account & service management: apps/uconnect/src (part 7 of 8) | 31 | 1896 |
| 016-apps-uconnect-part8.md | Uconnect account & service management: apps/uconnect (part 8 of 8) | 14 | 1083 |
| 017-apps-gokinetic-business-api-part1.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/api (part 1 of 8) | 31 | 1987 |
| 018-apps-gokinetic-business-api-src-modules-part2.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 2 of 8) | 13 | 1987 |
| 019-apps-gokinetic-business-api-src-modules-part3.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 3 of 8) | 14 | 1960 |
| 020-apps-gokinetic-business-api-src-modules-part4.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 4 of 8) | 18 | 1914 |
| 021-apps-gokinetic-business-part5.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business (part 5 of 8) | 20 | 1979 |
| 022-apps-gokinetic-business-web-src-app-part6.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/web/src/app (part 6 of 8) | 16 | 1974 |
| 023-apps-gokinetic-business-web-src-app-part7.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/web/src/app (part 7 of 8) | 14 | 1994 |
| 024-apps-gokinetic-business-web-part8.md | Go Kinetic Business self-care (B2B): apps/gokinetic-business/web (part 8 of 8) | 13 | 631 |
| 025-apps-gokinetic-consumer-ios-part1.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios (part 1 of 7) | 14 | 1918 |
| 026-apps-gokinetic-consumer-ios-sources-gokineticcore-part2.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticCore (part 2 of 7) | 14 | 1990 |
| 027-apps-gokinetic-consumer-ios-sources-part3.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources (part 3 of 7) | 15 | 1936 |
| 028-apps-gokinetic-consumer-ios-sources-gokineticfeatures-part4.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticFeatures (part 4 of 7) | 15 | 1903 |
| 029-apps-gokinetic-consumer-ios-sources-gokineticfeatures-part5.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticFeatures (part 5 of 7) | 15 | 1979 |
| 030-apps-gokinetic-consumer-ios-part6.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios (part 6 of 7) | 12 | 1955 |
| 031-apps-gokinetic-consumer-ios-tests-part7.md | Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Tests (part 7 of 7) | 5 | 737 |
| 032-apps-enterprise-partner-portal-backend-part1.md | Enterprise Partner Portal: apps/enterprise-partner-portal/backend (part 1 of 8) | 19 | 1954 |
| 033-apps-enterprise-partner-portal-backend-src-main-java-com-uniti-partnerportal-part2.md | Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 2 of 8) | 21 | 1879 |
| 034-apps-enterprise-partner-portal-backend-src-main-java-com-uniti-partnerportal-part3.md | Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 3 of 8) | 16 | 1989 |
| 035-apps-enterprise-partner-portal-backend-src-main-java-com-uniti-partnerportal-part4.md | Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 4 of 8) | 17 | 1971 |
| 036-apps-enterprise-partner-portal-backend-src-main-java-com-uniti-partnerportal-part5.md | Enterprise Partner Portal: apps/enterprise-partner-portal/backend/src/main/java/com/uniti/partnerportal (part 5 of 8) | 13 | 1997 |
| 037-apps-enterprise-partner-portal-part6.md | Enterprise Partner Portal: apps/enterprise-partner-portal (part 6 of 8) | 22 | 1926 |
| 038-apps-enterprise-partner-portal-frontend-src-part7.md | Enterprise Partner Portal: apps/enterprise-partner-portal/frontend/src (part 7 of 8) | 27 | 1923 |
| 039-apps-enterprise-partner-portal-frontend-part8.md | Enterprise Partner Portal: apps/enterprise-partner-portal/frontend (part 8 of 8) | 8 | 579 |
| 040-apps-sdwan-portal-part1.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal (part 1 of 7) | 20 | 1973 |
| 041-apps-sdwan-portal-api-src-part2.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src (part 2 of 7) | 13 | 1527 |
| 042-apps-sdwan-portal-api-src-providers-part3.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src/providers (part 3 of 7) | 8 | 1688 |
| 043-apps-sdwan-portal-api-src-part4.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src (part 4 of 7) | 16 | 1842 |
| 044-apps-sdwan-portal-part5.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal (part 5 of 7) | 22 | 1927 |
| 045-apps-sdwan-portal-web-src-part6.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/web/src (part 6 of 7) | 24 | 1960 |
| 046-apps-sdwan-portal-web-part7.md | SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/web (part 7 of 7) | 7 | 462 |
| 047-apps-hosted-services-part1.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services (part 1 of 6) | 32 | 1979 |
| 048-apps-hosted-services-app-part2.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 2 of 6) | 44 | 1951 |
| 049-apps-hosted-services-app-part3.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 3 of 6) | 23 | 1838 |
| 050-apps-hosted-services-app-services-part4.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app/Services (part 4 of 6) | 13 | 1955 |
| 051-apps-hosted-services-app-part5.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 5 of 6) | 11 | 1870 |
| 052-apps-hosted-services-part6.md | Hosted Services (hosted voice, email, web hosting): apps/hosted-services (part 6 of 6) | 21 | 1793 |
| 053-apps-portal-support-part1.md | Portal Support (WordPress plugin + Contentful CMS sync): apps/portal-support (part 1 of 2) | 28 | 1913 |
| 054-apps-portal-support-wordpress-plugin-uniti-support-part2.md | Portal Support (WordPress plugin + Contentful CMS sync): apps/portal-support/wordpress-plugin/uniti-support (part 2 of 2) | 16 | 1203 |
| 055-apps-iconnect-wholesale-server-part1.md | iConnect Wholesale ordering: apps/iconnect-wholesale/server (part 1 of 7) | 28 | 1900 |
| 056-apps-iconnect-wholesale-server-src-iconnect-wholesale-application-part2.md | iConnect Wholesale ordering: apps/iconnect-wholesale/server/src/IConnect.Wholesale.Application (part 2 of 7) | 15 | 1941 |
| 057-apps-iconnect-wholesale-server-src-part3.md | iConnect Wholesale ordering: apps/iconnect-wholesale/server/src (part 3 of 7) | 14 | 1838 |
| 058-apps-iconnect-wholesale-server-src-part4.md | iConnect Wholesale ordering: apps/iconnect-wholesale/server/src (part 4 of 7) | 17 | 1904 |
| 059-apps-iconnect-wholesale-server-part5.md | iConnect Wholesale ordering: apps/iconnect-wholesale/server (part 5 of 7) | 17 | 1885 |
| 060-apps-iconnect-wholesale-part6.md | iConnect Wholesale ordering: apps/iconnect-wholesale (part 6 of 7) | 23 | 1952 |
| 061-apps-iconnect-wholesale-web-part7.md | iConnect Wholesale ordering: apps/iconnect-wholesale/web (part 7 of 7) | 14 | 678 |
| 062-apps-chatbot-part1.md | Customer support chatbot: apps/chatbot (part 1 of 4) | 16 | 1935 |
| 063-apps-chatbot-src-dialog-part2.md | Customer support chatbot: apps/chatbot/src/dialog (part 2 of 4) | 14 | 1808 |
| 064-apps-chatbot-src-part3.md | Customer support chatbot: apps/chatbot/src (part 3 of 4) | 17 | 1920 |
| 065-apps-chatbot-part4.md | Customer support chatbot: apps/chatbot (part 4 of 4) | 15 | 1413 |
| 066-apps-uce-part1.md | UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce (part 1 of 3) | 24 | 1994 |
| 067-apps-uce-src-part2.md | UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce/src (part 2 of 3) | 22 | 1949 |
| 068-apps-uce-part3.md | UCE Unified Customer Experience shell (SaaSquatch, MS Clarity, FullStory): apps/uce (part 3 of 3) | 9 | 557 |
| 069-qa-playwright-part1.md | QA automation and API specs: qa/playwright (part 1 of 5) | 20 | 1945 |
| 070-qa-part2.md | QA automation and API specs: qa (part 2 of 5) | 13 | 1629 |
| 071-qa-part3.md | QA automation and API specs: qa (part 3 of 5) | 20 | 1948 |
| 072-qa-part4.md | QA automation and API specs: qa (part 4 of 5) | 23 | 1950 |
| 073-qa-swagger-specs-part5.md | QA automation and API specs: qa/swagger/specs (part 5 of 5) | 3 | 1126 |
| 074-data-snowflake.md | Data warehouse and analytics: data/snowflake | 36 | 1902 |
| 075-observability.md | Monitoring and alerting: observability | 16 | 861 |
| 076-design.md | Design tokens and export tooling: design | 20 | 1284 |

# Uniti Self-Care Platform

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

## Scope of this edition

This edition contains the application source only, so it can be ingested into a knowledge
platform. Per-app unit tests and build/project configuration (`package.json`, `tsconfig`,
`*.csproj`/`*.sln`, `pom.xml`, `composer.json`, `Dockerfile`, `appsettings*.json`, `.env.example`,
Razor `.cshtml` views) are not included. The `qa/` folder (Playwright, Selenium, Postman,
Swagger) is kept in full because it is the QA stack itself.

## Shared conventions

See [CONVENTIONS.md](CONVENTIONS.md).

# QA automation and API specs: qa (part 3 of 5)

- **Application:** QA automation and API specs
- **Tech stack:** Playwright, Selenium (Java), Postman, Swagger/OpenAPI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 20

## Files

- `qa/postman/collections/uconnect-account.postman_collection.json` (372 lines)
- `qa/postman/environments/dev.postman_environment.json` (20 lines)
- `qa/postman/environments/staging.postman_environment.json` (20 lines)
- `qa/selenium/README.md` (52 lines)
- `qa/selenium/pom.xml` (151 lines)
- `qa/selenium/src/test/java/com/uniti/qa/core/config/TestConfig.java` (143 lines)
- `qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverFactory.java` (133 lines)
- `qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverManager.java` (57 lines)
- `qa/selenium/src/test/java/com/uniti/qa/core/wait/Waits.java` (123 lines)
- `qa/selenium/src/test/java/com/uniti/qa/data/DealData.java` (56 lines)
- `qa/selenium/src/test/java/com/uniti/qa/data/TestDataProviders.java` (71 lines)
- `qa/selenium/src/test/java/com/uniti/qa/listeners/ReportListener.java` (101 lines)
- `qa/selenium/src/test/java/com/uniti/qa/listeners/RetryAnalyzer.java` (42 lines)
- `qa/selenium/src/test/java/com/uniti/qa/listeners/ScreenshotListener.java` (82 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/BasePage.java` (108 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/common/SignInPage.java` (60 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/epp/CommissionStatementPage.java` (77 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealDetailPage.java` (57 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealRegistrationForm.java` (111 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealsPage.java` (112 lines)

## qa/postman/collections/uconnect-account.postman_collection.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/postman/collections/uconnect-account.postman_collection.json`.

```json
{
  "info": {
    "_postman_id": "b4d2e9a7-1f6c-4a3e-8d5b-7c9e0f1a2b02",
    "name": "Uniti Uconnect - Accounts, Billing & Tickets",
    "description": "Uconnect (.NET 8) account management API: account profile, services, invoices, payments and the support ticket lifecycle OPEN -> IN_PROGRESS -> PENDING_CUSTOMER -> RESOLVED -> CLOSED.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [{ "key": "token", "value": "{{accessToken}}", "type": "string" }]
  },
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "const now = Date.now();",
          "const expiresAt = Number(pm.collectionVariables.get('accessTokenExpiresAt') || 0);",
          "if (!pm.collectionVariables.get('accessToken') || expiresAt - 60000 < now) {",
          "  pm.sendRequest({",
          "    url: pm.environment.get('oidcTokenUrl'),",
          "    method: 'POST',",
          "    header: { 'Content-Type': 'application/x-www-form-urlencoded' },",
          "    body: { mode: 'urlencoded', urlencoded: [",
          "      { key: 'grant_type', value: 'client_credentials' },",
          "      { key: 'client_id', value: pm.environment.get('oidcClientId') },",
          "      { key: 'client_secret', value: pm.environment.get('oidcClientSecret') },",
          "      { key: 'scope', value: pm.environment.get('oidcScope') }",
          "    ] }",
          "  }, (err, res) => {",
          "    if (err || res.code !== 200) { throw new Error('Token request failed: ' + (err || res.status)); }",
          "    const body = res.json();",
          "    pm.collectionVariables.set('accessToken', body.access_token);",
          "    pm.collectionVariables.set('accessTokenExpiresAt', String(now + body.expires_in * 1000));",
          "  });",
          "}",
          "const correlationId = pm.variables.replaceIn('{{$guid}}');",
          "pm.variables.set('correlationId', correlationId);",
          "pm.request.headers.upsert({ key: 'X-Correlation-Id', value: correlationId });"
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('correlation id is echoed', () => {",
          "  pm.expect(pm.response.headers.get('X-Correlation-Id')).to.eql(pm.variables.get('correlationId'));",
          "});",
          "if (pm.response.code >= 400) {",
          "  pm.test('errors are RFC 7807 problem+json', () => {",
          "    pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json');",
          "    pm.expect(pm.response.json()).to.include.keys('type', 'title', 'status');",
          "  });",
          "}"
        ]
      }
    }
  ],
  "variable": [
    { "key": "accessToken", "value": "" },
    { "key": "accessTokenExpiresAt", "value": "0" },
    { "key": "invoiceId", "value": "" },
    { "key": "ticketId", "value": "" }
  ],
  "item": [
    {
      "name": "Accounts",
      "item": [
        {
          "name": "Get account",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "pm.test('account schema', () => pm.response.to.have.jsonSchema({",
                  "  type: 'object',",
                  "  required: ['id', 'name', 'segment', 'billingEmail', 'status'],",
                  "  properties: {",
                  "    id: { type: 'string', pattern: '^ACC-\\\\d{8}$' },",
                  "    segment: { enum: ['B2C', 'B2B'] },",
                  "    status: { enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'] }",
                  "  }",
                  "}));"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/{{accountId}}",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "{{accountId}}"]
            }
          }
        },
        {
          "name": "List services",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const body = pm.response.json();",
                  "pm.test('every service belongs to the account and has an address', () => {",
                  "  body.items.forEach(s => {",
                  "    pm.expect(s.accountId).to.eql(pm.environment.get('accountId'));",
                  "    pm.expect(s.serviceAddress).to.have.property('postalCode');",
                  "  });",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/{{accountId}}/services?page=1&pageSize=25",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "{{accountId}}", "services"],
              "query": [
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "25" }
              ]
            }
          }
        },
        {
          "name": "Unknown account returns 404",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": ["pm.test('404 Not Found', () => pm.response.to.have.status(404));"]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/ACC-99999999",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "ACC-99999999"]
            }
          }
        }
      ]
    },
    {
      "name": "Billing",
      "item": [
        {
          "name": "List invoices",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const body = pm.response.json();",
                  "pm.test('invoices sorted by periodStart desc', () => {",
                  "  const starts = body.items.map(i => i.periodStart);",
                  "  pm.expect(starts).to.eql([...starts].sort().reverse());",
                  "});",
                  "pm.test('amounts are integer minor units', () => {",
                  "  body.items.forEach(i => pm.expect(Number.isInteger(i.amountDue.amountMinor)).to.be.true);",
                  "});",
                  "if (body.items.length) { pm.collectionVariables.set('invoiceId', body.items[0].id); }"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/{{accountId}}/invoices?page=1&pageSize=12",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "{{accountId}}", "invoices"],
              "query": [
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "12" }
              ]
            }
          }
        },
        {
          "name": "Download invoice PDF",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK as PDF', () => {",
                  "  pm.response.to.have.status(200);",
                  "  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/pdf');",
                  "  pm.expect(pm.response.headers.get('Content-Disposition')).to.include(pm.collectionVariables.get('invoiceId') + '.pdf');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [{ "key": "Accept", "value": "application/pdf" }],
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/invoices/{{invoiceId}}/pdf",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "invoices", "{{invoiceId}}", "pdf"]
            }
          }
        },
        {
          "name": "Payment with float amount rejected",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('400 with amountMinor field error', () => {",
                  "  pm.response.to.have.status(400);",
                  "  pm.expect(pm.response.json().errors.map(e => e.field)).to.include('amount.amountMinor');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"invoiceId\": \"{{invoiceId}}\",\n  \"amount\": { \"amountMinor\": 1999.5, \"currency\": \"USD\" },\n  \"paymentMethodId\": \"pm_sandbox_visa\"\n}"
            },
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/{{accountId}}/payments",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "{{accountId}}", "payments"]
            }
          }
        }
      ]
    },
    {
      "name": "Tickets",
      "item": [
        {
          "name": "Create ticket",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('201 Created', () => pm.response.to.have.status(201));",
                  "const ticket = pm.response.json();",
                  "pm.test('ticket starts OPEN with requested priority', () => {",
                  "  pm.expect(ticket.id).to.match(/^TCK-\\d{8}$/);",
                  "  pm.expect(ticket.status).to.eql('OPEN');",
                  "  pm.expect(ticket.priority).to.eql('P2');",
                  "});",
                  "pm.collectionVariables.set('ticketId', ticket.id);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subject\": \"QA-PM Intermittent loss of sync\",\n  \"description\": \"ONT loses sync between 18:00 and 20:00 local time.\",\n  \"priority\": \"P2\",\n  \"category\": \"CONNECTIVITY\"\n}"
            },
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/accounts/{{accountId}}/tickets",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "accounts", "{{accountId}}", "tickets"]
            }
          }
        },
        {
          "name": "Invalid transition OPEN -> PENDING_CUSTOMER",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('409 Conflict for skipped lifecycle step', () => pm.response.to.have.status(409));"
                ]
              }
            }
          ],
          "request": {
            "method": "PATCH",
            "header": [{ "key": "Content-Type", "value": "application/merge-patch+json" }],
            "body": { "mode": "raw", "raw": "{\n  \"status\": \"RESOLVED\"\n}" },
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/tickets/{{ticketId}}",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "tickets", "{{ticketId}}"]
            }
          }
        },
        {
          "name": "Add customer comment",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('201 Created', () => pm.response.to.have.status(201));",
                  "pm.test('comment authored by customer', () => pm.expect(pm.response.json().authorType).to.eql('CUSTOMER'));"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": { "mode": "raw", "raw": "{\n  \"body\": \"PON light flashes red during the drop-outs.\"\n}" },
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/tickets/{{ticketId}}/comments",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "tickets", "{{ticketId}}", "comments"]
            }
          }
        },
        {
          "name": "Close ticket",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK and CLOSED', () => {",
                  "  pm.response.to.have.status(200);",
                  "  pm.expect(pm.response.json().status).to.eql('CLOSED');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "PATCH",
            "header": [{ "key": "Content-Type", "value": "application/merge-patch+json" }],
            "body": { "mode": "raw", "raw": "{\n  \"status\": \"CLOSED\"\n}" },
            "url": {
              "raw": "{{uconnectApiBaseUrl}}/api/v1/tickets/{{ticketId}}",
              "host": ["{{uconnectApiBaseUrl}}"],
              "path": ["api", "v1", "tickets", "{{ticketId}}"]
            }
          }
        }
      ]
    }
  ]
}
```

## qa/postman/environments/dev.postman_environment.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/postman/environments/dev.postman_environment.json`.

```json
{
  "id": "0d7a5c3e-9b1f-4e2a-8c6d-1f2e3a4b5c10",
  "name": "Uniti Self-Care - dev",
  "values": [
    { "key": "ecomApiBaseUrl", "value": "https://dev.api.example.net/ecom", "type": "default", "enabled": true },
    { "key": "uconnectApiBaseUrl", "value": "https://dev.api.example.net/uconnect", "type": "default", "enabled": true },
    { "key": "partnerApiBaseUrl", "value": "https://dev.api.example.net/partner", "type": "default", "enabled": true },
    { "key": "sdwanApiBaseUrl", "value": "https://dev.api.example.net/sdwan", "type": "default", "enabled": true },
    { "key": "oidcTokenUrl", "value": "https://dev.auth.example.net/oauth2/token", "type": "default", "enabled": true },
    { "key": "oidcScope", "value": "selfcare.api", "type": "default", "enabled": true },
    { "key": "oidcClientId", "value": "", "type": "secret", "enabled": true },
    { "key": "oidcClientSecret", "value": "", "type": "secret", "enabled": true },
    { "key": "partnerTestClientId", "value": "epp-qa-ropc", "type": "default", "enabled": true },
    { "key": "partnerAdminUsername", "value": "qa.partneradmin@example.net", "type": "default", "enabled": true },
    { "key": "partnerAdminPassword", "value": "", "type": "secret", "enabled": true },
    { "key": "accountId", "value": "ACC-00010042", "type": "default", "enabled": true }
  ],
  "_postman_variable_scope": "environment"
}
```

## qa/postman/environments/staging.postman_environment.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/postman/environments/staging.postman_environment.json`.

```json
{
  "id": "1e8b6d4f-0c2a-4f3b-9d7e-2a3b4c5d6e20",
  "name": "Uniti Self-Care - staging",
  "values": [
    { "key": "ecomApiBaseUrl", "value": "https://staging.api.example.net/ecom", "type": "default", "enabled": true },
    { "key": "uconnectApiBaseUrl", "value": "https://staging.api.example.net/uconnect", "type": "default", "enabled": true },
    { "key": "partnerApiBaseUrl", "value": "https://staging.api.example.net/partner", "type": "default", "enabled": true },
    { "key": "sdwanApiBaseUrl", "value": "https://staging.api.example.net/sdwan", "type": "default", "enabled": true },
    { "key": "oidcTokenUrl", "value": "https://staging.auth.example.net/oauth2/token", "type": "default", "enabled": true },
    { "key": "oidcScope", "value": "selfcare.api", "type": "default", "enabled": true },
    { "key": "oidcClientId", "value": "", "type": "secret", "enabled": true },
    { "key": "oidcClientSecret", "value": "", "type": "secret", "enabled": true },
    { "key": "partnerTestClientId", "value": "epp-qa-ropc", "type": "default", "enabled": true },
    { "key": "partnerAdminUsername", "value": "qa.partneradmin@example.net", "type": "default", "enabled": true },
    { "key": "partnerAdminPassword", "value": "", "type": "secret", "enabled": true },
    { "key": "accountId", "value": "ACC-00020317", "type": "default", "enabled": true }
  ],
  "_postman_variable_scope": "environment"
}
```

## qa/selenium/README.md

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: markdown. Path: `qa/selenium/README.md`.

````markdown
# Selenium UI suite (Java 17, TestNG)

Browser tests for the **Enterprise Partner Portal** (Spring Boot + React) and
**Uconnect** (.NET 8 Razor UI), owned by QA alongside the Playwright suite. The
partner channel team's regression packs historically ran on Selenium Grid, so
these journeys stay here.

## Structure

```
src/test/java/com/uniti/qa
  core/config     TestConfig: properties -> env vars -> -D overrides
  core/driver     DriverFactory (Chrome/Firefox/Edge, local or Grid), ThreadLocal DriverManager
  core/wait       Waits: explicit/fluent waits, SPA settle detection, stale-safe clicks
  pages           page objects (common sign-in, epp/*, uconnect/*)
  data            DealData record + TestNG data providers (JSON under resources/testdata)
  listeners       screenshots + page source on failure, JSON run summary, infra-only retry
  tests           BaseTest, epp/*, uconnect/*
src/test/resources
  config/         default, dev, staging properties (no secrets)
  suites/         TestNG suite files
  testdata/       data-provider inputs
```

## Running

```bash
export PERSONA_PARTNER_ADMIN_PASSWORD=...   # from the CI secret store
export PERSONA_PARTNER_AGENT_PASSWORD=...
export PERSONA_BUSINESS_ADMIN_PASSWORD=...
export PERSONA_BUSINESS_USER_PASSWORD=...

mvn test                                    # dev, local Chrome
mvn test -Denv=staging -Pgrid               # staging, Selenium Grid
mvn test -Psmoke -Dbrowser=firefox          # smoke group only
mvn allure:serve                            # open the Allure report
```

Any key can be overridden with `-Dkey=value` or the matching upper-case env var
(`epp.base.url` -> `EPP_BASE_URL`). Passwords are read only from
`PERSONA_<NAME>_PASSWORD` variables.

## Rules of the road

- No implicit waits and no `Thread.sleep`; all synchronisation is via `Waits`.
- Assertions use AssertJ; compare money via `data-amount-minor` attributes.
- `RetryAnalyzer` retries only WebDriver infrastructure errors, never assertion
  failures or element timeouts.
- Every created deal or invited user is tagged `qa-` so the nightly purge job
  removes leftovers.
- Failure artefacts land in `target/failures/` and in the Allure report.
````

## qa/selenium/pom.xml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: xml. Path: `qa/selenium/pom.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.uniti.qa</groupId>
    <artifactId>selfcare-selenium</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>
    <name>Uniti Self-Care Selenium UI tests</name>
    <description>TestNG + Selenium 4 suite for the Enterprise Partner Portal and Uconnect.</description>

    <properties>
        <maven.compiler.release>17</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>

        <selenium.version>4.23.0</selenium.version>
        <testng.version>7.10.2</testng.version>
        <jackson.version>2.17.2</jackson.version>
        <slf4j.version>2.0.13</slf4j.version>
        <logback.version>1.5.6</logback.version>
        <assertj.version>3.26.3</assertj.version>
        <allure.version>2.28.0</allure.version>
        <aspectj.version>1.9.22.1</aspectj.version>

        <!-- Overridable from the command line: -Denv=staging -Dgroups=smoke -Dbrowser=firefox -->
        <env>dev</env>
        <browser>chrome</browser>
        <execution>local</execution>
        <suite>testng.xml</suite>
        <groups/>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.seleniumhq.selenium</groupId>
            <artifactId>selenium-java</artifactId>
            <version>${selenium.version}</version>
        </dependency>
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>${testng.version}</version>
        </dependency>
        <dependency>
            <groupId>org.assertj</groupId>
            <artifactId>assertj-core</artifactId>
            <version>${assertj.version}</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>${jackson.version}</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.datatype</groupId>
            <artifactId>jackson-datatype-jsr310</artifactId>
            <version>${jackson.version}</version>
        </dependency>
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
            <version>${slf4j.version}</version>
        </dependency>
        <dependency>
            <groupId>ch.qos.logback</groupId>
            <artifactId>logback-classic</artifactId>
            <version>${logback.version}</version>
        </dependency>
        <dependency>
            <groupId>io.qameta.allure</groupId>
            <artifactId>allure-testng</artifactId>
            <version>${allure.version}</version>
        </dependency>
    </dependencies>

    <build>
        <testResources>
            <testResource>
                <directory>src/test/resources</directory>
            </testResource>
        </testResources>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
                <configuration>
                    <release>${maven.compiler.release}</release>
                    <compilerArgs>
                        <arg>-Xlint:all</arg>
                    </compilerArgs>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.3.1</version>
                <configuration>
                    <suiteXmlFiles>
                        <suiteXmlFile>src/test/resources/suites/${suite}</suiteXmlFile>
                    </suiteXmlFiles>
                    <groups>${groups}</groups>
                    <systemPropertyVariables>
                        <env>${env}</env>
                        <browser>${browser}</browser>
                        <execution>${execution}</execution>
                        <allure.results.directory>${project.build.directory}/allure-results</allure.results.directory>
                    </systemPropertyVariables>
                    <argLine>
                        -javaagent:"${settings.localRepository}/org/aspectj/aspectjweaver/${aspectj.version}/aspectjweaver-${aspectj.version}.jar"
                    </argLine>
                    <redirectTestOutputToFile>true</redirectTestOutputToFile>
                </configuration>
                <dependencies>
                    <dependency>
                        <groupId>org.aspectj</groupId>
                        <artifactId>aspectjweaver</artifactId>
                        <version>${aspectj.version}</version>
                    </dependency>
                </dependencies>
            </plugin>
            <plugin>
                <groupId>io.qameta.allure</groupId>
                <artifactId>allure-maven</artifactId>
                <version>2.12.0</version>
                <configuration>
                    <reportVersion>${allure.version}</reportVersion>
                    <resultsDirectory>${project.build.directory}/allure-results</resultsDirectory>
                </configuration>
            </plugin>
        </plugins>
    </build>

    <profiles>
        <profile>
            <id>grid</id>
            <properties>
                <execution>grid</execution>
            </properties>
        </profile>
        <profile>
            <id>smoke</id>
            <properties>
                <groups>smoke</groups>
            </properties>
        </profile>
    </profiles>
</project>
```

## qa/selenium/src/test/java/com/uniti/qa/core/config/TestConfig.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/core/config/TestConfig.java`.

```java
package com.uniti.qa.core.config;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;

/**
 * Loads configuration in increasing order of precedence:
 * {@code config/default.properties} -> {@code config/<env>.properties} -> environment
 * variables -> JVM system properties. Secrets (passwords, grid tokens) are only ever
 * read from environment variables and never committed to properties files.
 */
public final class TestConfig {

    private static final TestConfig INSTANCE = load();

    private final Properties properties;
    private final String environment;

    private TestConfig(Properties properties, String environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public static TestConfig get() {
        return INSTANCE;
    }

    private static TestConfig load() {
        String env = System.getProperty("env", Optional.ofNullable(System.getenv("TEST_ENV")).orElse("dev"))
                .toLowerCase(Locale.ROOT);
        Properties props = new Properties();
        readInto(props, "config/default.properties", true);
        readInto(props, "config/" + env + ".properties", true);
        return new TestConfig(props, env);
    }

    private static void readInto(Properties target, String resource, boolean required) {
        try (InputStream in = TestConfig.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                if (required) {
                    throw new IllegalStateException("Missing configuration resource " + resource);
                }
                return;
            }
            target.load(in);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read " + resource, e);
        }
    }

    public String environment() {
        return environment;
    }

    /**
     * Resolves a key: system property wins, then an environment variable derived from the key
     * ({@code epp.base.url -> EPP_BASE_URL}), then the properties files.
     */
    public Optional<String> find(String key) {
        String sys = System.getProperty(key);
        if (sys != null && !sys.isBlank()) {
            return Optional.of(sys);
        }
        String envValue = System.getenv(toEnvName(key));
        if (envValue != null && !envValue.isBlank()) {
            return Optional.of(envValue);
        }
        return Optional.ofNullable(properties.getProperty(key)).filter(v -> !v.isBlank());
    }

    public String require(String key) {
        return find(key).orElseThrow(() -> new IllegalStateException(
                "Configuration '" + key + "' is not set (env var " + toEnvName(key) + ")"));
    }

    public int intValue(String key, int fallback) {
        return find(key).map(Integer::parseInt).orElse(fallback);
    }

    public boolean boolValue(String key, boolean fallback) {
        return find(key).map(Boolean::parseBoolean).orElse(fallback);
    }

    public Duration seconds(String key, long fallbackSeconds) {
        return Duration.ofSeconds(find(key).map(Long::parseLong).orElse(fallbackSeconds));
    }

    public URI eppBaseUrl() {
        return URI.create(require("epp.base.url"));
    }

    public URI uconnectBaseUrl() {
        return URI.create(require("uconnect.base.url"));
    }

    public String browser() {
        return find("browser").orElse("chrome");
    }

    public boolean headless() {
        return boolValue("headless", System.getenv("CI") != null);
    }

    public boolean remote() {
        return "grid".equalsIgnoreCase(find("execution").orElse("local"));
    }

    public URI gridUrl() {
        return URI.create(require("grid.url"));
    }

    public Duration explicitWait() {
        return seconds("wait.explicit.seconds", 15);
    }

    public Duration pageLoadTimeout() {
        return seconds("wait.pageload.seconds", 45);
    }

    public Credentials credentials(String persona) {
        Objects.requireNonNull(persona, "persona");
        String prefix = "persona." + persona.toLowerCase(Locale.ROOT);
        return new Credentials(require(prefix + ".username"), require(prefix + ".password"));
    }

    static String toEnvName(String key) {
        return key.toUpperCase(Locale.ROOT).replace('.', '_').replace('-', '_');
    }

    public record Credentials(String username, String password) {
        @Override
        public String toString() {
            return "Credentials[username=" + username + ", password=***]";
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverFactory.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverFactory.java`.

```java
package com.uniti.qa.core.driver;

import com.uniti.qa.core.config.TestConfig;
import java.net.MalformedURLException;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import org.openqa.selenium.Capabilities;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.PageLoadStrategy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.remote.LocalFileDetector;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Creates WebDriver instances for local execution (Selenium Manager resolves drivers) or
 * for a Selenium Grid. Browser choice and headless mode come from {@link TestConfig}.
 */
public final class DriverFactory {

    private static final Logger LOG = LoggerFactory.getLogger(DriverFactory.class);

    public enum Browser {
        CHROME, FIREFOX, EDGE;

        static Browser from(String value) {
            try {
                return Browser.valueOf(value.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Unsupported browser '" + value + "'. Use chrome, firefox or edge.", e);
            }
        }
    }

    private final TestConfig config;

    public DriverFactory(TestConfig config) {
        this.config = config;
    }

    public WebDriver create() {
        Browser browser = Browser.from(config.browser());
        Capabilities capabilities = capabilitiesFor(browser);
        WebDriver driver = config.remote() ? remote(capabilities) : local(browser, capabilities);
        configure(driver);
        LOG.info("Started {} driver ({}, headless={})", browser, config.remote() ? "grid" : "local", config.headless());
        return driver;
    }

    private WebDriver local(Browser browser, Capabilities capabilities) {
        return switch (browser) {
            case CHROME -> new ChromeDriver((ChromeOptions) capabilities);
            case FIREFOX -> new FirefoxDriver((FirefoxOptions) capabilities);
            case EDGE -> new EdgeDriver((EdgeOptions) capabilities);
        };
    }

    private WebDriver remote(Capabilities capabilities) {
        try {
            RemoteWebDriver driver = new RemoteWebDriver(config.gridUrl().toURL(), capabilities);
            driver.setFileDetector(new LocalFileDetector());
            return driver;
        } catch (MalformedURLException e) {
            throw new IllegalStateException("Invalid grid.url " + config.gridUrl(), e);
        }
    }

    private Capabilities capabilitiesFor(Browser browser) {
        boolean headless = config.headless();
        String size = config.intValue("window.width", 1440) + "," + config.intValue("window.height", 900);
        return switch (browser) {
            case CHROME -> {
                ChromeOptions options = new ChromeOptions();
                options.setPageLoadStrategy(PageLoadStrategy.NORMAL);
                options.addArguments("--window-size=" + size, "--disable-search-engine-choice-screen", "--lang=en-US");
                if (headless) {
                    options.addArguments("--headless=new");
                }
                options.setExperimentalOption("prefs", Map.of(
                        "download.prompt_for_download", false,
                        "credentials_enable_service", false,
                        "profile.password_manager_enabled", false));
                applyGridMetadata(options::setCapability);
                yield options;
            }
            case FIREFOX -> {
                FirefoxOptions options = new FirefoxOptions();
                options.setPageLoadStrategy(PageLoadStrategy.NORMAL);
                if (headless) {
                    options.addArguments("-headless");
                }
                options.addPreference("intl.accept_languages", "en-US");
                applyGridMetadata(options::setCapability);
                yield options;
            }
            case EDGE -> {
                EdgeOptions options = new EdgeOptions();
                options.addArguments("--window-size=" + size);
                if (headless) {
                    options.addArguments("--headless=new");
                }
                applyGridMetadata(options::setCapability);
                yield options;
            }
        };
    }

    private void applyGridMetadata(java.util.function.BiConsumer<String, Object> setter) {
        if (!config.remote()) {
            return;
        }
        setter.accept("se:name", "uniti-selfcare-" + config.environment());
        setter.accept("se:recordVideo", config.boolValue("grid.record.video", false));
    }

    private void configure(WebDriver driver) {
        driver.manage().timeouts().pageLoadTimeout(config.pageLoadTimeout());
        driver.manage().timeouts().implicitlyWait(Duration.ZERO);
        if (!config.headless()) {
            driver.manage().window().setSize(new Dimension(
                    config.intValue("window.width", 1440), config.intValue("window.height", 900)));
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverManager.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/core/driver/DriverManager.java`.

```java
package com.uniti.qa.core.driver;

import com.uniti.qa.core.config.TestConfig;
import java.util.Optional;
import org.openqa.selenium.WebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Holds one WebDriver per test thread so TestNG can run methods in parallel.
 * Implicit waits are disabled; synchronisation is done with {@link com.uniti.qa.core.wait.Waits}.
 */
public final class DriverManager {

    private static final Logger LOG = LoggerFactory.getLogger(DriverManager.class);
    private static final ThreadLocal<WebDriver> DRIVER = new ThreadLocal<>();

    private DriverManager() {
    }

    public static WebDriver start() {
        if (DRIVER.get() != null) {
            throw new IllegalStateException("A driver is already running on thread " + Thread.currentThread().getName());
        }
        WebDriver driver = new DriverFactory(TestConfig.get()).create();
        DRIVER.set(driver);
        return driver;
    }

    public static WebDriver driver() {
        WebDriver driver = DRIVER.get();
        if (driver == null) {
            throw new IllegalStateException("No driver for thread " + Thread.currentThread().getName()
                    + "; did the test extend BaseTest?");
        }
        return driver;
    }

    public static Optional<WebDriver> current() {
        return Optional.ofNullable(DRIVER.get());
    }

    public static void quit() {
        WebDriver driver = DRIVER.get();
        if (driver == null) {
            return;
        }
        try {
            driver.quit();
        } catch (RuntimeException e) {
            LOG.warn("Driver quit failed; session may leak on the grid", e);
        } finally {
            DRIVER.remove();
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/core/wait/Waits.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/core/wait/Waits.java`.

```java
package com.uniti.qa.core.wait;

import com.uniti.qa.core.config.TestConfig;
import java.time.Duration;
import java.util.List;
import java.util.function.Function;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.FluentWait;
import org.openqa.selenium.support.ui.Wait;

/**
 * Explicit-wait helpers. Every lookup in page objects goes through here so tests never
 * rely on implicit waits or {@code Thread.sleep}.
 */
public final class Waits {

    private final WebDriver driver;
    private final Duration timeout;
    private final Duration polling;

    public Waits(WebDriver driver) {
        this(driver, TestConfig.get().explicitWait());
    }

    public Waits(WebDriver driver, Duration timeout) {
        this.driver = driver;
        this.timeout = timeout;
        this.polling = Duration.ofMillis(TestConfig.get().intValue("wait.polling.millis", 250));
    }

    public Waits withTimeout(Duration other) {
        return new Waits(driver, other);
    }

    private Wait<WebDriver> fluent(String message) {
        return new FluentWait<>(driver)
                .withTimeout(timeout)
                .pollingEvery(polling)
                .ignoring(NoSuchElementException.class)
                .ignoring(StaleElementReferenceException.class)
                .withMessage(message);
    }

    public <T> T until(Function<WebDriver, T> condition, String description) {
        return fluent(description).until(condition);
    }

    public WebElement visible(By locator) {
        return until(ExpectedConditions.visibilityOfElementLocated(locator), "visible: " + locator);
    }

    public WebElement clickable(By locator) {
        return until(ExpectedConditions.elementToBeClickable(locator), "clickable: " + locator);
    }

    public WebElement present(By locator) {
        return until(ExpectedConditions.presenceOfElementLocated(locator), "present: " + locator);
    }

    public List<WebElement> allVisible(By locator) {
        return until(ExpectedConditions.visibilityOfAllElementsLocatedBy(locator), "all visible: " + locator);
    }

    public void invisible(By locator) {
        until(ExpectedConditions.invisibilityOfElementLocated(locator), "invisible: " + locator);
    }

    public void textPresent(By locator, String text) {
        until(ExpectedConditions.textToBePresentInElementLocated(locator, text), "text '" + text + "' in " + locator);
    }

    public void attributeEquals(By locator, String attribute, String value) {
        until(ExpectedConditions.attributeToBe(locator, attribute, value),
                attribute + "='" + value + "' on " + locator);
    }

    public void urlContains(String fragment) {
        until(ExpectedConditions.urlContains(fragment), "url contains " + fragment);
    }

    public void countEquals(By locator, int expected) {
        until(ExpectedConditions.numberOfElementsToBe(locator, expected), expected + " x " + locator);
    }

    /** Waits for document.readyState and for the SPA's in-flight fetch counter to drain. */
    public void pageSettled() {
        until(d -> {
            JavascriptExecutor js = (JavascriptExecutor) d;
            Object ready = js.executeScript("return document.readyState");
            Object pending = js.executeScript("return window.__pendingRequests === undefined ? 0 : window.__pendingRequests");
            return "complete".equals(ready) && Long.valueOf(0L).equals(toLong(pending));
        }, "page settled (readyState complete, no pending requests)");
    }

    /** Re-locates and clicks, retrying through stale references caused by React re-renders. */
    public void click(By locator) {
        until(d -> {
            WebElement element = ExpectedConditions.elementToBeClickable(locator).apply(d);
            if (element == null) {
                return false;
            }
            element.click();
            return true;
        }, "click " + locator);
    }

    public void type(By locator, CharSequence text) {
        WebElement element = visible(locator);
        element.clear();
        element.sendKeys(text);
    }

    private static Long toLong(Object value) {
        return value instanceof Number n ? n.longValue() : -1L;
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/data/DealData.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/data/DealData.java`.

```java
package com.uniti.qa.data;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Immutable deal registration input. The monthly value is held as integer minor units.
 */
public record DealData(
        String customerName,
        String customerDomain,
        String contactEmail,
        List<String> products,
        int siteCount,
        long monthlyValueMinor,
        String currency,
        String notes) {

    public DealData {
        Objects.requireNonNull(customerName, "customerName");
        Objects.requireNonNull(customerDomain, "customerDomain");
        products = List.copyOf(products);
        if (siteCount < 1) {
            throw new IllegalArgumentException("siteCount must be >= 1");
        }
        if (monthlyValueMinor < 0) {
            throw new IllegalArgumentException("monthlyValueMinor must be >= 0");
        }
    }

    /** Builds a unique, valid deal tagged with a QA prefix so cleanup jobs can purge it. */
    public static DealData unique(List<String> products, int sites, long monthlyValueMinor) {
        String tag = "qa-" + UUID.randomUUID().toString().substring(0, 8);
        String domain = tag + ".qa.example.net";
        return new DealData("QA Freight " + tag.toUpperCase(Locale.ROOT), domain, "it-lead@" + domain,
                products, sites, monthlyValueMinor, "USD", null);
    }

    public DealData withNotes(String value) {
        return new DealData(customerName, customerDomain, contactEmail, products, siteCount, monthlyValueMinor, currency, value);
    }

    public DealData withCustomerName(String value) {
        return new DealData(value, customerDomain, contactEmail, products, siteCount, monthlyValueMinor, currency, notes);
    }

    /** Value as typed into the form, e.g. 2499.00 for 249900 minor units. */
    public String monthlyValueDisplay() {
        return BigDecimal.valueOf(monthlyValueMinor).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/data/TestDataProviders.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/data/TestDataProviders.java`.

```java
package com.uniti.qa.data;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.testng.annotations.DataProvider;

/**
 * TestNG data providers. Tabular scenarios live as JSON under {@code src/test/resources/testdata}
 * so non-developers can extend them without touching Java.
 */
public final class TestDataProviders {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private TestDataProviders() {
    }

    static <T> List<T> readJson(String resource, TypeReference<List<T>> type) {
        try (InputStream in = TestDataProviders.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Test data resource not found: " + resource);
            }
            return MAPPER.readValue(in, type);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to parse " + resource, e);
        }
    }

    /** Valid deal shapes across product mixes and site counts. */
    @DataProvider(name = "validDeals", parallel = true)
    public static Object[][] validDeals() {
        List<Map<String, Object>> rows = readJson("testdata/deals-valid.json", new TypeReference<>() { });
        return rows.stream()
                .map(row -> new Object[] {
                        row.get("scenario"),
                        DealData.unique(castList(row.get("products")), ((Number) row.get("sites")).intValue(),
                                ((Number) row.get("monthlyValueMinor")).longValue())
                })
                .toArray(Object[][]::new);
    }

    /** Invalid customer step inputs paired with the field expected to be flagged. */
    @DataProvider(name = "invalidDealCustomer")
    public static Object[][] invalidDealCustomer() {
        List<Map<String, String>> rows = readJson("testdata/deals-invalid-customer.json", new TypeReference<>() { });
        return rows.stream()
                .map(row -> new Object[] { row.get("scenario"), row.get("customerName"), row.get("customerDomain"),
                        row.get("contactEmail"), row.get("invalidField") })
                .toArray(Object[][]::new);
    }

    /** Invite inputs for Uconnect user management and the expected outcome. */
    @DataProvider(name = "userInvites")
    public static Object[][] userInvites() {
        return new Object[][] {
                { "business user", "BUSINESS_USER", true, null },
                { "second admin", "BUSINESS_ADMIN", true, null },
                { "malformed email", "BUSINESS_USER", false, "Enter a valid email address" },
        };
    }

    @SuppressWarnings("unchecked")
    private static List<String> castList(Object value) {
        return (List<String>) value;
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/listeners/ReportListener.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/listeners/ReportListener.java`.

```java
package com.uniti.qa.listeners;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.uniti.qa.core.config.TestConfig;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.ISuite;
import org.testng.ISuiteListener;
import org.testng.ITestListener;
import org.testng.ITestResult;

/**
 * Writes a compact JSON run summary ({@code target/run-summary.json}) consumed by the CI
 * pipeline to post results and by the flaky-test tracker. Also logs one structured line
 * per test so console output is greppable.
 */
public final class ReportListener implements ITestListener, ISuiteListener {

    private static final Logger LOG = LoggerFactory.getLogger(ReportListener.class);
    private static final Path SUMMARY = Paths.get("target", "run-summary.json");

    private final ConcurrentLinkedQueue<Outcome> outcomes = new ConcurrentLinkedQueue<>();
    private Instant startedAt;

    record Outcome(String testClass, String method, String status, long durationMs, List<String> groups,
                   String failure, int attempt) {
    }

    record Summary(String environment, String browser, Instant startedAt, Instant finishedAt,
                   Map<String, Long> totals, List<Outcome> results) {
    }

    @Override
    public void onStart(ISuite suite) {
        startedAt = Instant.now();
        LOG.info("Suite '{}' starting against env={} browser={}", suite.getName(),
                TestConfig.get().environment(), TestConfig.get().browser());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        record(result, "PASSED");
    }

    @Override
    public void onTestFailure(ITestResult result) {
        record(result, "FAILED");
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        record(result, result.wasRetried() ? "RETRIED" : "SKIPPED");
    }

    private void record(ITestResult result, String status) {
        long duration = result.getEndMillis() - result.getStartMillis();
        String failure = result.getThrowable() == null ? null : result.getThrowable().getClass().getSimpleName()
                + ": " + result.getThrowable().getMessage();
        int attempt = result.getMethod().getCurrentInvocationCount();
        Outcome outcome = new Outcome(result.getTestClass().getRealClass().getSimpleName(),
                result.getMethod().getMethodName(), status, duration,
                List.of(result.getMethod().getGroups()), failure, attempt);
        outcomes.add(outcome);
        LOG.info("test={}.{} status={} durationMs={} attempt={}", outcome.testClass(), outcome.method(), status,
                duration, attempt);
    }

    @Override
    public void onFinish(ISuite suite) {
        Instant finished = Instant.now();
        Map<String, Long> totals = outcomes.stream()
                .collect(Collectors.groupingBy(Outcome::status, Collectors.counting()));
        Summary summary = new Summary(TestConfig.get().environment(), TestConfig.get().browser(),
                startedAt, finished, totals, List.copyOf(outcomes));
        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .enable(SerializationFeature.INDENT_OUTPUT);
        try {
            Files.createDirectories(SUMMARY.getParent());
            mapper.writeValue(SUMMARY.toFile(), summary);
        } catch (IOException e) {
            LOG.error("Failed to write run summary", e);
        }
        LOG.info("Suite '{}' finished in {}s: {}", suite.getName(),
                Duration.between(startedAt, finished).toSeconds(), totals);
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/listeners/RetryAnalyzer.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/listeners/RetryAnalyzer.java`.

```java
package com.uniti.qa.listeners;

import com.uniti.qa.core.config.TestConfig;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicInteger;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriverException;
import org.testng.IAnnotationTransformer;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;
import org.testng.annotations.ITestAnnotation;

/**
 * Retries a failed test only for infrastructure-type failures (WebDriver/grid errors),
 * never for assertion failures, so genuine regressions are not masked. Registered for every
 * test via the nested {@link Transformer}.
 */
public final class RetryAnalyzer implements IRetryAnalyzer {

    private final AtomicInteger attempts = new AtomicInteger();
    private final int maxAttempts = TestConfig.get().intValue("retry.max.attempts", 1);

    @Override
    public boolean retry(ITestResult result) {
        Throwable cause = result.getThrowable();
        boolean infrastructure = cause instanceof WebDriverException
                && !(cause instanceof TimeoutException)
                && !(cause instanceof NoSuchElementException);
        return infrastructure && attempts.incrementAndGet() <= maxAttempts;
    }

    public static final class Transformer implements IAnnotationTransformer {
        @Override
        @SuppressWarnings("rawtypes")
        public void transform(ITestAnnotation annotation, Class testClass, Constructor testConstructor, Method testMethod) {
            annotation.setRetryAnalyzer(RetryAnalyzer.class);
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/listeners/ScreenshotListener.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/listeners/ScreenshotListener.java`.

```java
package com.uniti.qa.listeners;

import com.uniti.qa.core.config.TestConfig;
import com.uniti.qa.core.driver.DriverManager;
import io.qameta.allure.Allure;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.logging.LogEntries;
import org.openqa.selenium.logging.LogType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.ITestListener;
import org.testng.ITestResult;

/**
 * On failure, captures a screenshot, the page source and (Chromium only) browser console
 * logs. Artefacts are written to {@code target/failures/} and attached to Allure.
 */
public final class ScreenshotListener implements ITestListener {

    private static final Logger LOG = LoggerFactory.getLogger(ScreenshotListener.class);
    private static final Path OUTPUT = Paths.get("target", "failures");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    @Override
    public void onTestFailure(ITestResult result) {
        if (!TestConfig.get().boolValue("screenshot.on.failure", true)) {
            return;
        }
        DriverManager.current().ifPresent(driver -> capture(driver, result));
    }

    @Override
    public void onTestFailedButWithinSuccessPercentage(ITestResult result) {
        onTestFailure(result);
    }

    private void capture(WebDriver driver, ITestResult result) {
        String baseName = result.getTestClass().getRealClass().getSimpleName() + "."
                + result.getMethod().getMethodName() + "-" + STAMP.format(Instant.now());
        try {
            Files.createDirectories(OUTPUT);

            byte[] png = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
            Files.write(OUTPUT.resolve(baseName + ".png"), png);
            Allure.addAttachment("Screenshot", "image/png", new ByteArrayInputStream(png), "png");

            String source = driver.getPageSource();
            Files.writeString(OUTPUT.resolve(baseName + ".html"), source, StandardCharsets.UTF_8);
            Allure.addAttachment("Page source", "text/html", source, "html");

            Allure.addAttachment("URL", driver.getCurrentUrl());
            browserConsole(driver).ifPresent(log -> Allure.addAttachment("Browser console", "text/plain", log, "txt"));
            LOG.info("Saved failure artefacts for {} to {}", baseName, OUTPUT.toAbsolutePath());
        } catch (IOException | RuntimeException e) {
            LOG.warn("Could not capture failure artefacts for {}", baseName, e);
        }
    }

    private java.util.Optional<String> browserConsole(WebDriver driver) {
        try {
            LogEntries entries = driver.manage().logs().get(LogType.BROWSER);
            StringBuilder out = new StringBuilder();
            entries.forEach(entry -> out.append(Instant.ofEpochMilli(entry.getTimestamp()))
                    .append(' ').append(entry.getLevel()).append(' ').append(entry.getMessage()).append('\n'));
            return out.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(out.toString());
        } catch (RuntimeException unsupported) {
            return java.util.Optional.empty();
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/BasePage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/BasePage.java`.

```java
package com.uniti.qa.pages;

import com.uniti.qa.core.wait.Waits;
import java.net.URI;
import java.util.List;
import java.util.Optional;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.Select;

/**
 * Base for all page objects. Locators prefer stable {@code data-testid} attributes that
 * both the Spring Boot/React partner UI and the Razor-based Uconnect UI render.
 */
public abstract class BasePage {

    protected static final By SPINNER = testId("page-loading");
    protected static final By TOAST = testId("toast-message");
    protected static final By PROBLEM_BANNER = testId("problem-banner");
    protected static final By PROBLEM_TITLE = testId("problem-title");
    protected static final By PROBLEM_CORRELATION = testId("problem-correlation-id");
    protected static final By H1 = By.cssSelector("main h1");

    protected final WebDriver driver;
    protected final Waits waits;
    protected final URI baseUrl;

    protected BasePage(WebDriver driver, URI baseUrl) {
        this.driver = driver;
        this.baseUrl = baseUrl;
        this.waits = new Waits(driver);
    }

    protected static By testId(String id) {
        return By.cssSelector("[data-testid='" + id + "']");
    }

    protected static By label(String text) {
        return By.xpath("//label[normalize-space()='" + text + "']/following::*[self::input or self::select or self::textarea][1]");
    }

    protected static By button(String text) {
        return By.xpath("//button[normalize-space()='" + text + "']");
    }

    protected static By link(String text) {
        return By.xpath("//a[normalize-space()='" + text + "']");
    }

    protected abstract String path();

    protected void open() {
        driver.navigate().to(baseUrl.resolve(path()).toString());
        waitUntilLoaded();
    }

    public void waitUntilLoaded() {
        waits.invisible(SPINNER);
        waits.visible(H1);
        waits.pageSettled();
    }

    public String heading() {
        return waits.visible(H1).getText().trim();
    }

    public String toastText() {
        return waits.visible(TOAST).getText().trim();
    }

    public boolean hasProblemBanner() {
        return !driver.findElements(PROBLEM_BANNER).isEmpty();
    }

    public String problemTitle() {
        return waits.visible(PROBLEM_TITLE).getText().trim();
    }

    public Optional<String> problemCorrelationId() {
        List<WebElement> elements = driver.findElements(PROBLEM_CORRELATION);
        return elements.isEmpty() ? Optional.empty() : Optional.of(elements.get(0).getText().trim());
    }

    protected void selectByVisibleText(By locator, String text) {
        new Select(waits.visible(locator)).selectByVisibleText(text);
    }

    protected void selectByValue(By locator, String value) {
        new Select(waits.visible(locator)).selectByValue(value);
    }

    protected void setCheckbox(By locator, boolean checked) {
        WebElement box = waits.clickable(locator);
        if (box.isSelected() != checked) {
            box.click();
        }
    }

    protected List<WebElement> tableRows(By table) {
        return waits.visible(table).findElements(By.cssSelector("tbody tr"));
    }

    protected boolean isInvalid(By field) {
        return "true".equals(waits.visible(field).getAttribute("aria-invalid"));
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/common/SignInPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/common/SignInPage.java`.

```java
package com.uniti.qa.pages.common;

import com.uniti.qa.core.config.TestConfig.Credentials;
import com.uniti.qa.core.wait.Waits;
import java.net.URI;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Shared OIDC hosted sign-in page used by both the Enterprise Partner Portal and Uconnect.
 * The portal redirects here and back to its landing path once a session is established.
 */
public final class SignInPage {

    private static final By EMAIL = By.id("signin-email");
    private static final By PASSWORD = By.id("signin-password");
    private static final By SUBMIT = By.cssSelector("button[type='submit'][data-action='sign-in']");
    private static final By ERROR = By.cssSelector("[role='alert'][data-testid='signin-error']");

    private final WebDriver driver;
    private final Waits waits;
    private final URI portalBase;
    private final String entryPath;

    public SignInPage(WebDriver driver, URI portalBase, String entryPath) {
        this.driver = driver;
        this.waits = new Waits(driver);
        this.portalBase = portalBase;
        this.entryPath = entryPath;
    }

    public SignInPage open() {
        driver.navigate().to(portalBase.resolve(entryPath).toString());
        waits.visible(EMAIL);
        return this;
    }

    public void submit(Credentials credentials) {
        waits.type(EMAIL, credentials.username());
        waits.type(PASSWORD, credentials.password());
        waits.click(SUBMIT);
    }

    /** Signs in and blocks until the browser is back on the portal's landing path. */
    public void signInAndLand(Credentials credentials, String landingPath) {
        open();
        submit(credentials);
        waits.urlContains(portalBase.getHost());
        waits.urlContains(landingPath);
    }

    public String errorMessage() {
        return waits.visible(ERROR).getText().trim();
    }

    public boolean isDisplayed() {
        return !driver.findElements(EMAIL).isEmpty();
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/epp/CommissionStatementPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/epp/CommissionStatementPage.java`.

```java
package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.YearMonth;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Monthly commission statements for a partner. Amounts are exposed through
 * {@code data-amount-minor} attributes so tests compare integer minor units, not formatted text.
 */
public final class CommissionStatementPage extends BasePage {

    private static final By PERIOD = By.name("statementPeriod");
    private static final By LINES_TABLE = By.cssSelector("table[aria-label='Commission lines']");
    private static final By TOTAL = testId("commission-total");
    private static final By CLAWBACK_TOTAL = testId("commission-clawback-total");
    private static final By DOWNLOAD_CSV = By.cssSelector("a[data-action='download-statement-csv']");
    private static final By NO_STATEMENT = testId("statement-unavailable");

    public CommissionStatementPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/commissions";
    }

    public CommissionStatementPage load() {
        open();
        return this;
    }

    public CommissionStatementPage selectPeriod(YearMonth period) {
        selectByValue(PERIOD, period.toString());
        waits.pageSettled();
        return this;
    }

    public boolean hasStatement() {
        return driver.findElements(NO_STATEMENT).isEmpty();
    }

    public List<CommissionLine> lines() {
        return tableRows(LINES_TABLE).stream().map(CommissionLine::from).toList();
    }

    public long totalMinor() {
        return Long.parseLong(waits.visible(TOTAL).getAttribute("data-amount-minor"));
    }

    public long clawbackMinor() {
        return Long.parseLong(waits.visible(CLAWBACK_TOTAL).getAttribute("data-amount-minor"));
    }

    public String csvHref() {
        return waits.visible(DOWNLOAD_CSV).getAttribute("href");
    }

    public record CommissionLine(String dealId, String accountId, String product, long amountMinor, boolean clawback) {
        static CommissionLine from(WebElement row) {
            List<WebElement> cells = row.findElements(By.tagName("td"));
            WebElement amount = row.findElement(By.cssSelector("[data-amount-minor]"));
            return new CommissionLine(
                    cells.get(0).getText().trim(),
                    cells.get(1).getText().trim(),
                    cells.get(2).getText().trim(),
                    Long.parseLong(amount.getAttribute("data-amount-minor")),
                    "true".equals(row.getAttribute("data-clawback")));
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealDetailPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealDetailPage.java`.

```java
package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Deal detail: summary, activity timeline and the withdraw action.
 */
public final class DealDetailPage extends BasePage {

    private static final By STAGE_BADGE = testId("deal-detail-stage");
    private static final By ACTIVITY_TAB = By.cssSelector("[role='tab'][data-tab='activity']");
    private static final By NOTE_INPUT = By.name("activityNote");
    private static final By POST_NOTE = By.cssSelector("button[data-action='post-note']");
    private static final By TIMELINE_ITEMS = By.cssSelector("[data-testid='activity-timeline'] li");
    private static final By WITHDRAW = By.cssSelector("button[data-action='withdraw-deal']");
    private static final By CONFIRM = By.cssSelector("[role='alertdialog'] button[data-action='confirm']");
    private static final By WITHDRAW_REASON = By.cssSelector("[role='alertdialog'] textarea[name='reason']");

    public DealDetailPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        throw new UnsupportedOperationException("Deal detail is reached from the deal list");
    }

    public String stage() {
        return waits.visible(STAGE_BADGE).getAttribute("data-stage");
    }

    public DealDetailPage addNote(String note) {
        waits.click(ACTIVITY_TAB);
        int before = driver.findElements(TIMELINE_ITEMS).size();
        waits.type(NOTE_INPUT, note);
        waits.click(POST_NOTE);
        waits.countEquals(TIMELINE_ITEMS, before + 1);
        return this;
    }

    public List<String> timeline() {
        waits.click(ACTIVITY_TAB);
        return waits.allVisible(TIMELINE_ITEMS).stream().map(e -> e.getText().trim()).toList();
    }

    public void withdraw(String reason) {
        waits.click(WITHDRAW);
        waits.type(WITHDRAW_REASON, reason);
        waits.click(CONFIRM);
        waits.attributeEquals(STAGE_BADGE, "data-stage", "WITHDRAWN");
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealRegistrationForm.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealRegistrationForm.java`.

```java
package com.uniti.qa.pages.epp;

import com.uniti.qa.core.wait.Waits;
import com.uniti.qa.data.DealData;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Three-step deal registration wizard (customer -> solution -> review) rendered in a modal.
 */
public final class DealRegistrationForm {

    private static final By DIALOG = By.cssSelector("[role='dialog'][aria-labelledby='register-deal-title']");
    private static final By CUSTOMER_NAME = By.name("customerName");
    private static final By CUSTOMER_DOMAIN = By.name("customerDomain");
    private static final By CONTACT_EMAIL = By.name("contactEmail");
    private static final By SITE_COUNT = By.name("siteCount");
    private static final By MONTHLY_VALUE = By.name("estimatedMonthlyValue");
    private static final By NOTES = By.name("notes");
    private static final By CONSENT = By.name("customerConsent");
    private static final By NEXT = By.cssSelector("[role='dialog'] button[data-action='next']");
    private static final By SUBMIT = By.cssSelector("[role='dialog'] button[data-action='submit']");
    private static final By STEP = By.cssSelector("[role='dialog'] [data-testid='wizard-step'][aria-current='step']");
    private static final By FIELD_ERRORS = By.cssSelector("[role='dialog'] [data-testid='field-error']");
    private static final By DIALOG_PROBLEM = By.cssSelector("[role='dialog'] [data-testid='problem-banner']");
    private static final By CREATED_ID = By.cssSelector("[data-testid='toast-message'] [data-deal-id]");

    private final WebDriver driver;
    private final Waits waits;

    DealRegistrationForm(WebDriver driver) {
        this.driver = driver;
        this.waits = new Waits(driver);
        waits.visible(DIALOG);
    }

    public String currentStep() {
        return waits.visible(STEP).getAttribute("data-step");
    }

    public DealRegistrationForm customer(DealData deal) {
        waits.type(CUSTOMER_NAME, deal.customerName());
        waits.type(CUSTOMER_DOMAIN, deal.customerDomain());
        waits.type(CONTACT_EMAIL, deal.contactEmail());
        waits.click(NEXT);
        return this;
    }

    public DealRegistrationForm solution(DealData deal) {
        waits.attributeEquals(STEP, "data-step", "solution");
        for (String sku : deal.products()) {
            WebElement box = waits.clickable(By.cssSelector("input[type='checkbox'][value='" + sku + "']"));
            if (!box.isSelected()) {
                box.click();
            }
        }
        waits.type(SITE_COUNT, Integer.toString(deal.siteCount()));
        waits.type(MONTHLY_VALUE, deal.monthlyValueDisplay());
        waits.click(NEXT);
        return this;
    }

    public DealRegistrationForm review(String notes, boolean consent) {
        waits.attributeEquals(STEP, "data-step", "review");
        if (notes != null) {
            waits.type(NOTES, notes);
        }
        WebElement box = waits.clickable(CONSENT);
        if (box.isSelected() != consent) {
            box.click();
        }
        return this;
    }

    public boolean submitEnabled() {
        return waits.visible(SUBMIT).isEnabled();
    }

    /** Submits and returns the created deal id from the confirmation toast. */
    public String submit() {
        waits.click(SUBMIT);
        waits.invisible(DIALOG);
        return waits.visible(CREATED_ID).getAttribute("data-deal-id");
    }

    /** Submits expecting the server to reject the registration; the dialog stays open. */
    public String submitExpectingProblem() {
        waits.click(SUBMIT);
        return waits.visible(DIALOG_PROBLEM).getText().trim();
    }

    public DealRegistrationForm clickNext() {
        waits.click(NEXT);
        return this;
    }

    public List<String> fieldErrors() {
        return driver.findElements(FIELD_ERRORS).stream().map(e -> e.getText().trim()).toList();
    }

    public boolean isFieldInvalid(String name) {
        return "true".equals(driver.findElement(By.name(name)).getAttribute("aria-invalid"));
    }

    public String registerAll(DealData deal) {
        return customer(deal).solution(deal).review(deal.notes(), true).submit();
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealsPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/epp/DealsPage.java`.

```java
package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Enterprise Partner Portal deal list: stage tabs, search and row-level summaries.
 */
public final class DealsPage extends BasePage {

    private static final By REGISTER_DEAL = testId("register-deal");
    private static final By SEARCH = By.cssSelector("input[type='search'][aria-label='Search deals']");
    private static final By GRID = By.cssSelector("[role='grid'][aria-label='Deals']");
    private static final By ROWS = By.cssSelector("[role='grid'][aria-label='Deals'] [role='row'][data-deal-id]");
    private static final By EMPTY_STATE = testId("deals-empty");

    public DealsPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/deals";
    }

    public DealsPage load() {
        open();
        return this;
    }

    public boolean canRegisterDeals() {
        return !driver.findElements(REGISTER_DEAL).isEmpty();
    }

    public DealRegistrationForm startRegistration() {
        waits.click(REGISTER_DEAL);
        return new DealRegistrationForm(driver);
    }

    public DealsPage showStage(String stage) {
        waits.click(By.cssSelector("[role='tab'][data-stage='" + stage + "']"));
        waits.attributeEquals(By.cssSelector("[role='tab'][data-stage='" + stage + "']"), "aria-selected", "true");
        waits.pageSettled();
        return this;
    }

    public DealsPage search(String text) {
        waits.type(SEARCH, text);
        waits.visible(SEARCH).submit();
        waits.pageSettled();
        return this;
    }

    public List<DealRow> rows() {
        waits.visible(GRID);
        return driver.findElements(ROWS).stream().map(DealRow::new).toList();
    }

    public Optional<DealRow> rowFor(String customerName) {
        return rows().stream().filter(row -> row.customerName().equals(customerName)).findFirst();
    }

    public boolean isEmpty() {
        return !driver.findElements(EMPTY_STATE).isEmpty();
    }

    public DealDetailPage open(String customerName) {
        DealRow row = rowFor(customerName).orElseThrow(() -> new IllegalStateException("No deal row for " + customerName));
        row.element.findElement(By.cssSelector("a[data-testid='deal-link']")).click();
        DealDetailPage detail = new DealDetailPage(driver, baseUrl);
        detail.waitUntilLoaded();
        return detail;
    }

    /** Read-only view of a single grid row. */
    public static final class DealRow {
        private final WebElement element;

        DealRow(WebElement element) {
            this.element = element;
        }

        public String dealId() {
            return element.getAttribute("data-deal-id");
        }

        public String customerName() {
            return element.findElement(By.cssSelector("[data-testid='deal-customer']")).getText().trim();
        }

        public String stage() {
            return element.findElement(By.cssSelector("[data-testid='deal-stage']")).getAttribute("data-stage");
        }

        public LocalDate expiresOn() {
            String iso = element.findElement(By.cssSelector("time[data-testid='deal-expires']")).getAttribute("datetime");
            return LocalDate.parse(iso.substring(0, 10));
        }

        public long monthlyValueMinor() {
            return Long.parseLong(element.findElement(By.cssSelector("[data-testid='deal-value']"))
                    .getAttribute("data-amount-minor"));
        }
    }
}
```

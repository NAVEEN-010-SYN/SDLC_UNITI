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

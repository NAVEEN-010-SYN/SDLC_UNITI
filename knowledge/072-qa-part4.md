# QA automation and API specs: qa (part 4 of 5)

- **Application:** QA automation and API specs
- **Tech stack:** Playwright, Selenium (Java), Postman, Swagger/OpenAPI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 23

## Files

- `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/DashboardPage.java` (83 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/InvoicesPage.java` (73 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/ServicesPage.java` (86 lines)
- `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/UsersPage.java` (80 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/BaseTest.java` (61 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/epp/CommissionStatementTest.java` (66 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/epp/DealRegistrationTest.java` (99 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/epp/PartnerSignInTest.java` (51 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/AccountServicesTest.java` (76 lines)
- `qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/InvoicesAndUsersTest.java` (80 lines)
- `qa/selenium/src/test/resources/config/default.properties` (23 lines)
- `qa/selenium/src/test/resources/config/dev.properties` (9 lines)
- `qa/selenium/src/test/resources/config/staging.properties` (10 lines)
- `qa/selenium/src/test/resources/logback-test.xml` (25 lines)
- `qa/selenium/src/test/resources/suites/testng.xml` (22 lines)
- `qa/selenium/src/test/resources/testdata/deals-invalid-customer.json` (31 lines)
- `qa/selenium/src/test/resources/testdata/deals-valid.json` (27 lines)
- `qa/swagger/README.md` (38 lines)
- `qa/swagger/package.json` (21 lines)
- `qa/swagger/scripts/lint-specs.mjs` (235 lines)
- `qa/swagger/scripts/lint-specs.test.mjs` (95 lines)
- `qa/swagger/specs/common.yaml` (236 lines)
- `qa/swagger/specs/ecom-orders.yaml` (423 lines)

## qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/DashboardPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/DashboardPage.java`.

```java
package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Uconnect dashboard: account summary card, active services and quick links.
 */
public final class DashboardPage extends BasePage {

    private static final By ACCOUNT_ID = testId("account-id");
    private static final By ACCOUNT_NAME = testId("account-name");
    private static final By BALANCE = testId("balance-amount");
    private static final By SERVICE_TILES = By.cssSelector("[data-testid='service-tile']");
    private static final By OPEN_TICKETS = testId("open-ticket-count");
    private static final By ACCOUNT_SWITCHER = By.cssSelector("select[aria-label='Switch account']");
    private static final By NAV = By.cssSelector("nav[aria-label='Primary']");

    public DashboardPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/dashboard";
    }

    public DashboardPage load() {
        open();
        return this;
    }

    public String accountId() {
        return waits.visible(ACCOUNT_ID).getText().trim();
    }

    public String accountName() {
        return waits.visible(ACCOUNT_NAME).getText().trim();
    }

    public long balanceMinor() {
        return Long.parseLong(waits.visible(BALANCE).getAttribute("data-amount-minor"));
    }

    public int activeServiceCount() {
        return (int) driver.findElements(SERVICE_TILES).stream()
                .filter(tile -> "ACTIVE".equals(tile.getAttribute("data-status")))
                .count();
    }

    public List<String> serviceIds() {
        return driver.findElements(SERVICE_TILES).stream().map(tile -> tile.getAttribute("data-service-id")).toList();
    }

    public int openTicketCount() {
        return Integer.parseInt(waits.visible(OPEN_TICKETS).getText().trim());
    }

    public boolean hasAccountSwitcher() {
        return !driver.findElements(ACCOUNT_SWITCHER).isEmpty();
    }

    public DashboardPage switchAccount(String accountId) {
        selectByValue(ACCOUNT_SWITCHER, accountId);
        waits.textPresent(ACCOUNT_ID, accountId);
        return this;
    }

    public List<String> primaryNavItems() {
        return waits.visible(NAV).findElements(By.cssSelector("a")).stream().map(a -> a.getText().trim()).toList();
    }

    public ServicesPage openService(String serviceId) {
        waits.click(By.cssSelector("[data-testid='service-tile'][data-service-id='" + serviceId + "'] a"));
        ServicesPage page = new ServicesPage(driver, baseUrl);
        page.waitUntilLoaded();
        return page;
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/InvoicesPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/InvoicesPage.java`.

```java
package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Invoice history with status filter and server-side pagination.
 */
public final class InvoicesPage extends BasePage {

    private static final By TABLE = By.cssSelector("table[aria-label='Invoices']");
    private static final By STATUS_FILTER = By.cssSelector("select[aria-label='Invoice status']");
    private static final By PAGE_INFO = testId("pagination-summary");
    private static final By NEXT_PAGE = By.cssSelector("nav[aria-label='Pagination'] button[data-action='next']");

    public InvoicesPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/billing";
    }

    public InvoicesPage load() {
        open();
        return this;
    }

    public List<InvoiceRow> rows() {
        return tableRows(TABLE).stream().map(InvoiceRow::from).toList();
    }

    public InvoicesPage filter(String status) {
        selectByValue(STATUS_FILTER, status);
        waits.pageSettled();
        return this;
    }

    public boolean hasNextPage() {
        List<WebElement> next = driver.findElements(NEXT_PAGE);
        return !next.isEmpty() && next.get(0).isEnabled();
    }

    public InvoicesPage nextPage() {
        String before = waits.visible(PAGE_INFO).getText();
        waits.click(NEXT_PAGE);
        waits.until(d -> !d.findElement(PAGE_INFO).getText().equals(before), "pagination summary to change");
        return this;
    }

    /** Parses "Showing 13-24 of 40" into the total count. */
    public int totalInvoices() {
        String text = waits.visible(PAGE_INFO).getText().trim();
        return Integer.parseInt(text.substring(text.lastIndexOf(' ') + 1));
    }

    public record InvoiceRow(String invoiceId, LocalDate dueDate, long amountMinor, String status) {
        static InvoiceRow from(WebElement row) {
            return new InvoiceRow(
                    row.findElement(By.cssSelector("[data-testid='invoice-id']")).getText().trim(),
                    LocalDate.parse(row.findElement(By.cssSelector("time[data-testid='invoice-due']")).getAttribute("datetime")),
                    Long.parseLong(row.findElement(By.cssSelector("[data-amount-minor]")).getAttribute("data-amount-minor")),
                    row.findElement(By.cssSelector("[data-testid='invoice-status']")).getAttribute("data-status"));
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/ServicesPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/ServicesPage.java`.

```java
package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Service detail and plan-change flow. Upgrades create an Order (DRAFT -> SUBMITTED) whose
 * id is shown on the confirmation panel.
 */
public final class ServicesPage extends BasePage {

    private static final By SERVICE_ID = testId("service-id");
    private static final By PLAN_NAME = testId("service-plan");
    private static final By STATUS = testId("service-status");
    private static final By ADDRESS = testId("service-address");
    private static final By CHANGE_PLAN = By.cssSelector("button[data-action='change-plan']");
    private static final By PLAN_OPTIONS = By.cssSelector("[role='radiogroup'][aria-label='Available plans'] input[type='radio']");
    private static final By EFFECTIVE_DATE = By.name("effectiveDate");
    private static final By REVIEW_PRICE = testId("plan-change-monthly-delta");
    private static final By CONFIRM_CHANGE = By.cssSelector("button[data-action='confirm-plan-change']");
    private static final By CONFIRMATION_ORDER = testId("plan-change-order-id");
    private static final By RUN_DIAGNOSTICS = By.cssSelector("button[data-action='run-line-test']");
    private static final By DIAGNOSTIC_RESULT = testId("line-test-result");

    public ServicesPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/services";
    }

    public String serviceId() {
        return waits.visible(SERVICE_ID).getText().trim();
    }

    public String planName() {
        return waits.visible(PLAN_NAME).getText().trim();
    }

    public String status() {
        return waits.visible(STATUS).getAttribute("data-status");
    }

    public String serviceAddress() {
        return waits.visible(ADDRESS).getText().trim();
    }

    public List<String> availablePlanSkus() {
        waits.click(CHANGE_PLAN);
        return waits.allVisible(PLAN_OPTIONS).stream().map(o -> o.getAttribute("value")).toList();
    }

    public ServicesPage choosePlan(String sku, String effectiveDateIso) {
        waits.click(By.cssSelector("[role='radiogroup'][aria-label='Available plans'] input[value='" + sku + "']"));
        waits.type(EFFECTIVE_DATE, effectiveDateIso);
        return this;
    }

    public long monthlyDeltaMinor() {
        return Long.parseLong(waits.visible(REVIEW_PRICE).getAttribute("data-amount-minor"));
    }

    public String confirmChange() {
        waits.click(CONFIRM_CHANGE);
        return waits.visible(CONFIRMATION_ORDER).getText().trim();
    }

    public boolean isEffectiveDateInvalid() {
        return isInvalid(EFFECTIVE_DATE);
    }

    public String runLineTest() {
        waits.click(RUN_DIAGNOSTICS);
        return waits.withTimeout(java.time.Duration.ofSeconds(90))
                .until(d -> {
                    String result = d.findElement(DIAGNOSTIC_RESULT).getAttribute("data-result");
                    return result == null || "RUNNING".equals(result) ? null : result;
                }, "line test to finish");
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/UsersPage.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/pages/uconnect/UsersPage.java`.

```java
package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.Optional;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Business user management. Only BUSINESS_ADMIN may invite users or change roles.
 */
public final class UsersPage extends BasePage {

    private static final By INVITE = By.cssSelector("button[data-action='invite-user']");
    private static final By INVITE_EMAIL = By.name("inviteEmail");
    private static final By INVITE_ROLE = By.name("inviteRole");
    private static final By SEND_INVITE = By.cssSelector("[role='dialog'] button[data-action='send-invite']");
    private static final By INVITE_ERROR = By.cssSelector("[role='dialog'] [data-testid='field-error']");
    private static final By USERS_TABLE = By.cssSelector("table[aria-label='Users']");
    private static final By ACCESS_DENIED = testId("access-denied");

    public UsersPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/settings/users";
    }

    public UsersPage load() {
        driver.navigate().to(baseUrl.resolve(path()).toString());
        waits.invisible(SPINNER);
        return this;
    }

    public boolean isAccessDenied() {
        return !driver.findElements(ACCESS_DENIED).isEmpty();
    }

    public UsersPage invite(String email, String role) {
        waits.click(INVITE);
        waits.type(INVITE_EMAIL, email);
        selectByValue(INVITE_ROLE, role);
        waits.click(SEND_INVITE);
        return this;
    }

    public String inviteError() {
        return waits.visible(INVITE_ERROR).getText().trim();
    }

    public Optional<UserRow> user(String email) {
        return tableRows(USERS_TABLE).stream()
                .filter(row -> row.getText().contains(email))
                .findFirst()
                .map(UserRow::from);
    }

    public void revoke(String email) {
        WebElement row = tableRows(USERS_TABLE).stream()
                .filter(r -> r.getText().contains(email))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("User not listed: " + email));
        row.findElement(By.cssSelector("button[data-action='revoke-user']")).click();
        waits.click(By.cssSelector("[role='alertdialog'] button[data-action='confirm']"));
        waits.until(d -> user(email).isEmpty(), "user " + email + " to be removed");
    }

    public record UserRow(String email, String role, String status) {
        static UserRow from(WebElement row) {
            return new UserRow(
                    row.findElement(By.cssSelector("[data-testid='user-email']")).getText().trim(),
                    row.findElement(By.cssSelector("[data-testid='user-role']")).getAttribute("data-role"),
                    row.findElement(By.cssSelector("[data-testid='user-status']")).getAttribute("data-status"));
        }
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/BaseTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/BaseTest.java`.

```java
package com.uniti.qa.tests;

import com.uniti.qa.core.config.TestConfig;
import com.uniti.qa.core.driver.DriverManager;
import com.uniti.qa.pages.common.SignInPage;
import java.net.URI;
import org.openqa.selenium.WebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Starts a fresh browser per test method (parallel-safe through {@link DriverManager}) and
 * offers sign-in helpers for each portal persona.
 */
public abstract class BaseTest {

    protected final Logger log = LoggerFactory.getLogger(getClass());
    protected final TestConfig config = TestConfig.get();

    @BeforeMethod(alwaysRun = true)
    public void startBrowser(java.lang.reflect.Method method) {
        MDC.put("test", getClass().getSimpleName() + "." + method.getName());
        DriverManager.start();
    }

    @AfterMethod(alwaysRun = true)
    public void stopBrowser() {
        DriverManager.quit();
        MDC.remove("test");
    }

    protected WebDriver driver() {
        return DriverManager.driver();
    }

    protected URI eppUrl() {
        return config.eppBaseUrl();
    }

    protected URI uconnectUrl() {
        return config.uconnectBaseUrl();
    }

    protected void signInToPartnerPortal(String persona) {
        new SignInPage(driver(), eppUrl(), "/login").signInAndLand(config.credentials(persona), "/deals");
        log.info("Signed in to partner portal as {}", persona);
    }

    protected void signInToUconnect(String persona) {
        new SignInPage(driver(), uconnectUrl(), "/signin").signInAndLand(config.credentials(persona), "/dashboard");
        log.info("Signed in to Uconnect as {}", persona);
    }

    protected String fixture(String key) {
        return config.require("fixture." + key);
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/epp/CommissionStatementTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/epp/CommissionStatementTest.java`.

```java
package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.pages.epp.CommissionStatementPage;
import com.uniti.qa.pages.epp.CommissionStatementPage.CommissionLine;
import com.uniti.qa.tests.BaseTest;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import org.testng.SkipException;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Commission statements: totals must reconcile to the line items in integer minor units,
 * and clawbacks (cancelled services within the clawback window) appear as negative lines.
 */
public class CommissionStatementTest extends BaseTest {

    private CommissionStatementPage statements;
    private final YearMonth lastMonth = YearMonth.now(ZoneOffset.UTC).minusMonths(1);

    @BeforeMethod(alwaysRun = true)
    public void open() {
        signInToPartnerPortal("partner_admin");
        statements = new CommissionStatementPage(driver(), eppUrl()).load().selectPeriod(lastMonth);
        if (!statements.hasStatement()) {
            throw new SkipException("No commission statement published for " + lastMonth);
        }
    }

    @Test(groups = {"smoke", "epp"}, description = "Statement total equals the sum of its lines")
    public void totalReconcilesToLines() {
        List<CommissionLine> lines = statements.lines();
        long sum = lines.stream().mapToLong(CommissionLine::amountMinor).sum();

        assertThat(lines).isNotEmpty();
        assertThat(statements.totalMinor()).isEqualTo(sum);
    }

    @Test(groups = {"epp"}, description = "Clawback lines are negative and summarised separately")
    public void clawbacksAreNegative() {
        List<CommissionLine> clawbacks = statements.lines().stream().filter(CommissionLine::clawback).toList();
        long clawbackSum = clawbacks.stream().mapToLong(CommissionLine::amountMinor).sum();

        assertThat(clawbacks).allSatisfy(line -> assertThat(line.amountMinor()).isNegative());
        assertThat(statements.clawbackMinor()).isEqualTo(clawbackSum);
    }

    @Test(groups = {"epp"}, description = "Every line references a deal and an account in canonical format")
    public void linesReferenceCanonicalIds() {
        assertThat(statements.lines()).allSatisfy(line -> {
            assertThat(line.dealId()).matches("DEAL-\\d{8}");
            assertThat(line.accountId()).matches("ACC-\\d{8}");
        });
    }

    @Test(groups = {"epp"}, description = "CSV download link targets the versioned statement API for the period")
    public void csvLinkTargetsPeriod() {
        assertThat(statements.csvHref())
                .contains("/api/v1/partner/commissions/statements/" + lastMonth)
                .endsWith("format=csv");
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/epp/DealRegistrationTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/epp/DealRegistrationTest.java`.

```java
package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.data.DealData;
import com.uniti.qa.data.TestDataProviders;
import com.uniti.qa.pages.epp.DealDetailPage;
import com.uniti.qa.pages.epp.DealRegistrationForm;
import com.uniti.qa.pages.epp.DealsPage;
import com.uniti.qa.pages.epp.DealsPage.DealRow;
import com.uniti.qa.tests.BaseTest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Deal registration in the Enterprise Partner Portal. Registered deals start REGISTERED and
 * are protected for 90 days; a domain may only be protected by one partner at a time.
 */
public class DealRegistrationTest extends BaseTest {

    private static final int PROTECTION_DAYS = 90;

    private DealsPage deals;

    @BeforeMethod(alwaysRun = true)
    public void signIn() {
        signInToPartnerPortal("partner_admin");
        deals = new DealsPage(driver(), eppUrl()).load();
    }

    @Test(groups = {"smoke", "epp"}, dataProvider = "validDeals", dataProviderClass = TestDataProviders.class,
            description = "Valid deals are registered and protected for 90 days")
    public void registersValidDeal(String scenario, DealData deal) {
        String dealId = deals.startRegistration().registerAll(deal.withNotes("Scenario: " + scenario));

        assertThat(dealId).matches("DEAL-\\d{8}");
        DealRow row = deals.showStage("REGISTERED").search(deal.customerName()).rowFor(deal.customerName())
                .orElseThrow(() -> new AssertionError("Registered deal not listed: " + deal.customerName()));
        assertThat(row.dealId()).isEqualTo(dealId);
        assertThat(row.stage()).isEqualTo("REGISTERED");
        assertThat(row.monthlyValueMinor()).isEqualTo(deal.monthlyValueMinor());

        LocalDate expected = LocalDate.now(ZoneOffset.UTC).plusDays(PROTECTION_DAYS);
        assertThat(row.expiresOn()).isBetween(expected.minusDays(1), expected);
    }

    @Test(groups = {"epp"}, dataProvider = "invalidDealCustomer", dataProviderClass = TestDataProviders.class,
            description = "Customer step rejects invalid input and stays on the step")
    public void rejectsInvalidCustomer(String scenario, String name, String domain, String email, String invalidField) {
        DealRegistrationForm form = deals.startRegistration();
        DealData input = new DealData(name, domain, email, List.of("FIB-BIZ-1G"), 1, 59_900, "USD", null);
        form.customer(input);

        assertThat(form.currentStep()).as(scenario).isEqualTo("customer");
        assertThat(form.isFieldInvalid(invalidField)).as(scenario + " flags " + invalidField).isTrue();
        assertThat(form.fieldErrors()).as(scenario).isNotEmpty();
    }

    @Test(groups = {"epp"}, description = "Submit is disabled until customer consent is confirmed")
    public void consentIsRequired() {
        DealData deal = DealData.unique(List.of("FIB-BIZ-500"), 2, 119_800);
        DealRegistrationForm form = deals.startRegistration().customer(deal).solution(deal).review(null, false);
        assertThat(form.submitEnabled()).isFalse();

        form.review(null, true);
        assertThat(form.submitEnabled()).isTrue();
    }

    @Test(groups = {"epp"}, description = "A protected customer domain cannot be registered twice")
    public void duplicateDomainIsRejected() {
        DealData original = DealData.unique(List.of("FIB-BIZ-1G"), 1, 59_900);
        deals.startRegistration().registerAll(original);

        DealData duplicate = original.withCustomerName(original.customerName() + " Holdings");
        DealRegistrationForm form = deals.startRegistration().customer(duplicate).solution(duplicate).review(null, true);
        String problem = form.submitExpectingProblem();

        assertThat(problem).containsIgnoringCase("already registered");
    }

    @Test(groups = {"epp"}, description = "Notes and withdrawal are recorded on the deal timeline")
    public void withdrawRecordsTimeline() {
        DealData deal = DealData.unique(List.of("SDWAN-VC-STD"), 4, 199_600);
        deals.startRegistration().registerAll(deal);

        DealDetailPage detail = deals.search(deal.customerName()).open(deal.customerName());
        detail.addNote("Customer postponed procurement to next quarter.");
        detail.withdraw("Customer postponed procurement.");

        assertThat(detail.stage()).isEqualTo("WITHDRAWN");
        assertThat(detail.timeline())
                .anyMatch(item -> item.contains("Customer postponed procurement to next quarter."))
                .anyMatch(item -> item.contains("Withdrawn"));
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/epp/PartnerSignInTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/epp/PartnerSignInTest.java`.

```java
package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.core.config.TestConfig.Credentials;
import com.uniti.qa.pages.common.SignInPage;
import com.uniti.qa.pages.epp.DealsPage;
import com.uniti.qa.tests.BaseTest;
import org.testng.annotations.Test;

public class PartnerSignInTest extends BaseTest {

    @Test(groups = {"smoke", "epp"}, description = "Partner admin lands on deals after sign-in")
    public void partnerAdminLandsOnDeals() {
        signInToPartnerPortal("partner_admin");

        DealsPage deals = new DealsPage(driver(), eppUrl());
        deals.waitUntilLoaded();
        assertThat(deals.heading()).isEqualTo("Deals");
        assertThat(deals.canRegisterDeals()).as("PARTNER_ADMIN may register deals").isTrue();
    }

    @Test(groups = {"epp"}, description = "Partner agent has read-only access to deals")
    public void partnerAgentIsReadOnly() {
        signInToPartnerPortal("partner_agent");

        DealsPage deals = new DealsPage(driver(), eppUrl()).load();
        assertThat(deals.canRegisterDeals()).as("PARTNER_AGENT must not see Register deal").isFalse();
    }

    @Test(groups = {"epp"}, description = "Wrong password is rejected without revealing which field was wrong")
    public void wrongPasswordIsRejected() {
        SignInPage signIn = new SignInPage(driver(), eppUrl(), "/login").open();
        Credentials real = config.credentials("partner_admin");
        signIn.submit(new Credentials(real.username(), real.password() + "-wrong"));

        assertThat(signIn.errorMessage()).isEqualTo("Incorrect email or password.");
        assertThat(signIn.isDisplayed()).isTrue();
    }

    @Test(groups = {"epp"}, description = "Deep link to a protected page returns to it after sign-in")
    public void deepLinkSurvivesSignIn() {
        driver().navigate().to(eppUrl().resolve("/commissions").toString());
        SignInPage signIn = new SignInPage(driver(), eppUrl(), "/login");
        assertThat(signIn.isDisplayed()).isTrue();

        signIn.submit(config.credentials("partner_admin"));
        assertThat(driver().getCurrentUrl()).contains("/commissions");
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/AccountServicesTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/AccountServicesTest.java`.

```java
package com.uniti.qa.tests.uconnect;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.pages.uconnect.DashboardPage;
import com.uniti.qa.pages.uconnect.ServicesPage;
import com.uniti.qa.tests.BaseTest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Uconnect account overview and service management for a BUSINESS_ADMIN.
 */
public class AccountServicesTest extends BaseTest {

    private DashboardPage dashboard;

    @BeforeMethod(alwaysRun = true)
    public void open() {
        signInToUconnect("business_admin");
        dashboard = new DashboardPage(driver(), uconnectUrl()).load();
    }

    @Test(groups = {"smoke", "uconnect"}, description = "Dashboard shows the fixture account and its services")
    public void dashboardShowsAccount() {
        assertThat(dashboard.accountId()).isEqualTo(fixture("business.account"));
        assertThat(dashboard.activeServiceCount()).isPositive();
        assertThat(dashboard.balanceMinor()).isNotNegative();
        assertThat(dashboard.primaryNavItems()).contains("Services", "Billing", "Support", "Users");
    }

    @Test(groups = {"uconnect"}, description = "Service detail shows plan, ACTIVE status and service address")
    public void serviceDetail() {
        String serviceId = dashboard.serviceIds().get(0);
        ServicesPage service = dashboard.openService(serviceId);

        assertThat(service.serviceId()).isEqualTo(serviceId);
        assertThat(service.status()).isEqualTo("ACTIVE");
        assertThat(service.planName()).containsPattern("\\d+ (Mbps|Gbps)");
        assertThat(service.serviceAddress()).isEqualTo(fixture("business.service.address"));
    }

    @Test(groups = {"uconnect"}, description = "Upgrade offers only faster plans and raises a SUBMITTED order")
    public void planUpgradeCreatesOrder() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        List<String> skus = service.availablePlanSkus();
        assertThat(skus).isNotEmpty().doesNotContain(service.planName());

        String target = skus.get(skus.size() - 1);
        String effective = LocalDate.now(ZoneOffset.UTC).plusDays(7).toString();
        service.choosePlan(target, effective);
        assertThat(service.monthlyDeltaMinor()).as("upgrade increases the monthly charge").isPositive();

        String orderId = service.confirmChange();
        assertThat(orderId).matches("ORD-\\d{8}");
    }

    @Test(groups = {"uconnect"}, description = "Backdated plan changes are rejected at the boundary")
    public void backdatedChangeRejected() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        String target = service.availablePlanSkus().get(0);
        service.choosePlan(target, LocalDate.now(ZoneOffset.UTC).minusDays(1).toString());

        assertThat(service.isEffectiveDateInvalid()).isTrue();
    }

    @Test(groups = {"uconnect"}, description = "Remote line test completes with a definitive result")
    public void lineTestCompletes() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        assertThat(service.runLineTest()).isIn("PASS", "DEGRADED", "FAIL");
    }
}
```

## qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/InvoicesAndUsersTest.java

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: java. Path: `qa/selenium/src/test/java/com/uniti/qa/tests/uconnect/InvoicesAndUsersTest.java`.

```java
package com.uniti.qa.tests.uconnect;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.data.TestDataProviders;
import com.uniti.qa.pages.uconnect.InvoicesPage;
import com.uniti.qa.pages.uconnect.InvoicesPage.InvoiceRow;
import com.uniti.qa.pages.uconnect.UsersPage;
import com.uniti.qa.pages.uconnect.UsersPage.UserRow;
import com.uniti.qa.tests.BaseTest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.testng.annotations.Test;

/**
 * Billing history and business user administration in Uconnect.
 */
public class InvoicesAndUsersTest extends BaseTest {

    @Test(groups = {"smoke", "uconnect"}, description = "Invoices are listed newest first")
    public void invoicesNewestFirst() {
        signInToUconnect("business_admin");
        List<InvoiceRow> rows = new InvoicesPage(driver(), uconnectUrl()).load().rows();

        assertThat(rows).isNotEmpty();
        assertThat(rows).isSortedAccordingTo(Comparator.comparing(InvoiceRow::dueDate).reversed());
        assertThat(rows).allSatisfy(row -> assertThat(row.invoiceId()).matches("INV-\\d{8}"));
    }

    @Test(groups = {"uconnect"}, description = "Overdue filter returns only OVERDUE invoices")
    public void overdueFilter() {
        signInToUconnect("business_admin");
        List<InvoiceRow> rows = new InvoicesPage(driver(), uconnectUrl()).load().filter("OVERDUE").rows();

        assertThat(rows).allSatisfy(row -> assertThat(row.status()).isEqualTo("OVERDUE"));
    }

    @Test(groups = {"uconnect"}, description = "Paging through history visits every invoice exactly once")
    public void paginationIsComplete() {
        signInToUconnect("business_admin");
        InvoicesPage invoices = new InvoicesPage(driver(), uconnectUrl()).load();
        int total = invoices.totalInvoices();

        List<String> seen = new ArrayList<>(invoices.rows().stream().map(InvoiceRow::invoiceId).toList());
        while (invoices.hasNextPage()) {
            seen.addAll(invoices.nextPage().rows().stream().map(InvoiceRow::invoiceId).toList());
        }
        assertThat(seen).hasSize(total).doesNotHaveDuplicates();
    }

    @Test(groups = {"uconnect"}, dataProvider = "userInvites", dataProviderClass = TestDataProviders.class,
            description = "Business admin invites users; invalid emails are rejected")
    public void inviteUser(String scenario, String role, boolean succeeds, String expectedError) {
        signInToUconnect("business_admin");
        UsersPage users = new UsersPage(driver(), uconnectUrl()).load();
        String email = succeeds
                ? "qa-" + UUID.randomUUID().toString().substring(0, 8) + "@qa.example.net"
                : "not-an-email";

        users.invite(email, role);

        if (succeeds) {
            UserRow row = users.user(email).orElseThrow(() -> new AssertionError(scenario + ": invite not listed"));
            assertThat(row.role()).isEqualTo(role);
            assertThat(row.status()).isEqualTo("INVITED");
            users.revoke(email);
        } else {
            assertThat(users.inviteError()).as(scenario).isEqualTo(expectedError);
        }
    }

    @Test(groups = {"uconnect"}, description = "Business user cannot open user administration")
    public void businessUserDenied() {
        signInToUconnect("business_user");
        assertThat(new UsersPage(driver(), uconnectUrl()).load().isAccessDenied()).isTrue();
    }
}
```

## qa/selenium/src/test/resources/config/default.properties

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: properties. Path: `qa/selenium/src/test/resources/config/default.properties`.

```properties
# Defaults shared by every environment. Override per environment in <env>.properties,
# or at runtime with -Dkey=value / KEY_NAME environment variables.

browser=chrome
execution=local
headless=false
window.width=1440
window.height=900

wait.explicit.seconds=15
wait.pageload.seconds=45
wait.polling.millis=250

retry.max.attempts=1
screenshot.on.failure=true

# Persona usernames; passwords must come from PERSONA_<NAME>_PASSWORD env vars.
persona.partner_admin.username=qa.partneradmin@example.net
persona.partner_agent.username=qa.partneragent@example.net
persona.business_admin.username=qa.bizadmin@example.net
persona.business_user.username=qa.bizuser@example.net
persona.consumer.username=qa.consumer@example.net
```

## qa/selenium/src/test/resources/config/dev.properties

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: properties. Path: `qa/selenium/src/test/resources/config/dev.properties`.

```properties
epp.base.url=https://dev.partners.example.net
uconnect.base.url=https://dev.uconnect.example.net
grid.url=http://selenium-grid.qa.svc.cluster.local:4444/wd/hub

# Fixture accounts seeded in dev by the nightly reset job
fixture.partner.id=PTR-100042
fixture.business.account=ACC-00010042
fixture.business.service.address=1200 Fibre Way, Little Rock, AR 72201
```

## qa/selenium/src/test/resources/config/staging.properties

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: properties. Path: `qa/selenium/src/test/resources/config/staging.properties`.

```properties
epp.base.url=https://staging.partners.example.net
uconnect.base.url=https://staging.uconnect.example.net
grid.url=https://selenium-grid.staging.example.net/wd/hub
headless=true
retry.max.attempts=2

fixture.partner.id=PTR-200017
fixture.business.account=ACC-00020317
fixture.business.service.address=48 Lightwave Ave, Conway, AR 72032
```

## qa/selenium/src/test/resources/logback-test.xml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: xml. Path: `qa/selenium/src/test/resources/logback-test.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} %-5level [%thread] [%X{test}] %logger{24} - %msg%n</pattern>
        </encoder>
    </appender>

    <appender name="FILE" class="ch.qos.logback.core.FileAppender">
        <file>target/logs/ui-tests.log</file>
        <encoder>
            <pattern>%d{ISO8601} %-5level [%thread] [%X{test}] %logger - %msg%n</pattern>
        </encoder>
    </appender>

    <logger name="org.openqa.selenium" level="WARN"/>
    <logger name="io.netty" level="WARN"/>
    <logger name="com.uniti.qa" level="INFO"/>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

## qa/selenium/src/test/resources/suites/testng.xml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: xml. Path: `qa/selenium/src/test/resources/suites/testng.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd">
<suite name="Uniti Self-Care UI" parallel="methods" thread-count="4" data-provider-thread-count="2">
    <listeners>
        <listener class-name="com.uniti.qa.listeners.ScreenshotListener"/>
        <listener class-name="com.uniti.qa.listeners.ReportListener"/>
        <listener class-name="com.uniti.qa.listeners.RetryAnalyzer$Transformer"/>
    </listeners>

    <test name="Enterprise Partner Portal">
        <packages>
            <package name="com.uniti.qa.tests.epp"/>
        </packages>
    </test>

    <test name="Uconnect">
        <packages>
            <package name="com.uniti.qa.tests.uconnect"/>
        </packages>
    </test>
</suite>
```

## qa/selenium/src/test/resources/testdata/deals-invalid-customer.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/selenium/src/test/resources/testdata/deals-invalid-customer.json`.

```json
[
  {
    "scenario": "blank customer name",
    "customerName": "",
    "customerDomain": "acme-freight.qa.example.net",
    "contactEmail": "it@acme-freight.qa.example.net",
    "invalidField": "customerName"
  },
  {
    "scenario": "domain with scheme",
    "customerName": "Acme Freight",
    "customerDomain": "https://acme-freight.qa.example.net",
    "contactEmail": "it@acme-freight.qa.example.net",
    "invalidField": "customerDomain"
  },
  {
    "scenario": "free-mail contact",
    "customerName": "Acme Freight",
    "customerDomain": "acme-freight.qa.example.net",
    "contactEmail": "acme.it@gmail.com",
    "invalidField": "contactEmail"
  },
  {
    "scenario": "contact not on customer domain",
    "customerName": "Acme Freight",
    "customerDomain": "acme-freight.qa.example.net",
    "contactEmail": "it@another-company.example.net",
    "invalidField": "contactEmail"
  }
]
```

## qa/selenium/src/test/resources/testdata/deals-valid.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/selenium/src/test/resources/testdata/deals-valid.json`.

```json
[
  {
    "scenario": "single-site fibre only",
    "products": ["FIB-BIZ-1G"],
    "sites": 1,
    "monthlyValueMinor": 59900
  },
  {
    "scenario": "multi-site fibre with VeloCloud SD-WAN",
    "products": ["FIB-BIZ-1G", "SDWAN-VC-STD"],
    "sites": 6,
    "monthlyValueMinor": 612000
  },
  {
    "scenario": "Fortinet SD-WAN with hosted voice",
    "products": ["FIB-BIZ-500", "SDWAN-FTNT-ADV", "HOSTED-VOICE-25"],
    "sites": 3,
    "monthlyValueMinor": 284750
  },
  {
    "scenario": "large campus 2 Gbps",
    "products": ["FIB-BIZ-2G", "STATIC-IP-29"],
    "sites": 12,
    "monthlyValueMinor": 1980000
  }
]
```

## qa/swagger/README.md

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: markdown. Path: `qa/swagger/README.md`.

````markdown
# OpenAPI specs

Contract specs for the APIs exercised by the Playwright, Selenium and Postman suites.

| Spec | Service | Base path |
|---|---|---|
| `specs/ecom-orders.yaml` | eCom GoKinetic checkout & orders | `/api/v1/checkout`, `/api/v1/orders` |
| `specs/uconnect-accounts-billing.yaml` | Uconnect accounts, invoices, payments | `/api/v1/accounts`, `/api/v1/invoices` |
| `specs/iconnect-wholesale-orders.yaml` | iConnect wholesale orders | `/api/v1/wholesale/orders` |
| `specs/sdwan-edges.yaml` | SD-WAN sites, edges, link health | `/api/v1/sdwan` |

`specs/common.yaml` holds the shared components (`ProblemDetails`, `ValidationProblem`,
`PageMeta`, `Money`, `AccountId`, correlation/idempotency headers and the standard error
responses). Service specs reference it with `./common.yaml#/components/...`.

## Linting

```bash
npm install
npm run lint          # all specs
npm run lint -- specs/sdwan-edges.yaml
npm test              # linter unit tests (node:test)
```

The linter runs `@apidevtools/swagger-parser` for structural validity, then enforces the
house rules from `CONVENTIONS.md`:

- every path is under `/api/v1/`; `operationId` is present and unique across all specs
- a global bearer security requirement backed by an `http`/`bearer` scheme
- every templated path parameter is declared, and vice versa
- 4xx/5xx responses are `application/problem+json`
- `page` and `pageSize` come together, and paginated responses are `PageMeta` + `items[]`
- properties named `*Minor` / `*Amount` are `integer`/`int64`
- every `$ref`, including cross-file ones, resolves

When adding an endpoint, update the spec in the same PR as the controller change and keep
the Postman collection's request paths in step with it.
````

## qa/swagger/package.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/swagger/package.json`.

```json
{
  "name": "@uniti/qa-swagger",
  "version": "1.0.0",
  "private": true,
  "description": "OpenAPI specs for key Uniti self-care APIs and a convention linter.",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "lint": "node scripts/lint-specs.mjs",
    "test": "node --test scripts/"
  },
  "dependencies": {
    "yaml": "^2.5.1"
  },
  "devDependencies": {
    "@apidevtools/swagger-parser": "^10.1.0"
  }
}
```

## qa/swagger/scripts/lint-specs.mjs

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: javascript. Path: `qa/swagger/scripts/lint-specs.mjs`.

```javascript
#!/usr/bin/env node
/**
 * Validates the OpenAPI specs under qa/swagger/specs against the platform
 * conventions in CONVENTIONS.md. Structural OpenAPI validity is delegated to
 * @apidevtools/swagger-parser; the rules below are the house rules it cannot know.
 *
 * Usage: node scripts/lint-specs.mjs [specFile...]   (defaults to every *.yaml except common.yaml)
 * Exit code is 1 when any rule reports an error.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = path.resolve(HERE, '..', 'specs');
const SHARED_FILE = 'common.yaml';
const HTTP_METHODS = ['get', 'put', 'post', 'patch', 'delete', 'head', 'options'];
const MONEY_NAME = /(Minor|Amount|amount)$/;

const docCache = new Map();

async function loadDoc(file) {
  const abs = path.resolve(file);
  if (!docCache.has(abs)) {
    docCache.set(abs, YAML.parse(await readFile(abs, 'utf8')));
  }
  return docCache.get(abs);
}

function pointerGet(doc, pointer) {
  if (!pointer || pointer === '/') return doc;
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? undefined : node[seg]), doc);
}

/** Resolves a $ref relative to the file it appears in. Returns { file, node } or null. */
export async function resolveRef(ref, fromFile) {
  const [filePart, pointer = ''] = ref.split('#');
  const file = filePart ? path.resolve(path.dirname(fromFile), filePart) : path.resolve(fromFile);
  let doc;
  try {
    doc = await loadDoc(file);
  } catch {
    return null;
  }
  const node = pointerGet(doc, pointer);
  return node === undefined ? null : { file, node };
}

/** Follows $ref chains (bounded) so rules can inspect the concrete object. */
async function deref(node, file, depth = 0) {
  if (!node || typeof node !== 'object' || !node.$ref || depth > 10) return { node, file };
  const hit = await resolveRef(node.$ref, file);
  return hit ? deref(hit.node, hit.file, depth + 1) : { node: undefined, file };
}

async function* walk(node, file, trail = []) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* walk(node[i], file, [...trail, i]);
    return;
  }
  if (!node || typeof node !== 'object') return;
  yield { node, trail };
  for (const [key, value] of Object.entries(node)) yield* walk(value, file, [...trail, key]);
}

function operations(doc) {
  const ops = [];
  for (const [route, item] of Object.entries(doc.paths || {})) {
    for (const method of HTTP_METHODS) {
      if (item[method]) ops.push({ route, method, op: item[method], pathParams: item.parameters || [] });
    }
  }
  return ops;
}

async function checkRefs(doc, file, report) {
  for await (const { node, trail } of walk(doc, file)) {
    if (typeof node.$ref === 'string' && !(await resolveRef(node.$ref, file))) {
      report('error', trail.join('.'), `unresolved $ref ${node.$ref}`);
    }
  }
}

function checkInfo(doc, report) {
  if (!/^3\.0\.\d+$/.test(String(doc.openapi))) report('error', 'openapi', 'must be OpenAPI 3.0.x');
  if (!doc.info?.title) report('error', 'info.title', 'is required');
  if (!/^\d+\.\d+\.\d+$/.test(String(doc.info?.version))) report('error', 'info.version', 'must be semver');
  if (!Array.isArray(doc.servers) || doc.servers.length === 0) report('warn', 'servers', 'no servers declared');
}

function checkSecurity(doc, report) {
  const schemes = doc.components?.securitySchemes || {};
  for (const requirement of doc.security || []) {
    for (const name of Object.keys(requirement)) {
      const scheme = schemes[name];
      if (!scheme) report('error', `security.${name}`, 'references an undeclared security scheme');
      else if (scheme.type !== 'http' || scheme.scheme !== 'bearer') {
        report('error', `components.securitySchemes.${name}`, 'must be an http bearer scheme');
      }
    }
  }
  if (!doc.security?.length) report('error', 'security', 'a global bearer security requirement is required');
}

async function paramNames(params, file) {
  const out = [];
  for (const p of params) {
    const { node } = await deref(p, file);
    if (node) out.push(node);
  }
  return out;
}

async function checkOperations(doc, file, report, seenOperationIds) {
  for (const { route, method, op, pathParams } of operations(doc)) {
    const where = `paths.${route}.${method}`;
    if (!route.startsWith('/api/v1/')) report('error', where, 'paths must be versioned under /api/v1');

    if (!op.operationId) report('error', where, 'operationId is required');
    else if (seenOperationIds.has(op.operationId)) {
      report('error', where, `operationId ${op.operationId} already used in ${seenOperationIds.get(op.operationId)}`);
    } else seenOperationIds.set(op.operationId, path.basename(file));

    const params = await paramNames([...pathParams, ...(op.parameters || [])], file);
    const declared = new Set(params.filter((p) => p.in === 'path').map((p) => p.name));
    const templated = new Set([...route.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));
    for (const name of templated) if (!declared.has(name)) report('error', where, `path parameter {${name}} is not declared`);
    for (const name of declared) if (!templated.has(name)) report('error', where, `declared path parameter ${name} is not in the route`);

    const query = new Set(params.filter((p) => p.in === 'query').map((p) => p.name));
    if (query.has('page') !== query.has('pageSize')) report('error', where, 'page and pageSize must be declared together');

    const responses = op.responses || {};
    const codes = Object.keys(responses);
    if (!codes.some((c) => /^2\d\d$/.test(c))) report('error', where, 'must declare a 2xx response');
    if (op.security?.length === 0) report('warn', where, 'operation opts out of authentication');

    for (const code of codes.filter((c) => /^[45]\d\d$/.test(c))) {
      const { node } = await deref(responses[code], file);
      const types = Object.keys(node?.content || {});
      if (!types.includes('application/problem+json')) {
        report('error', `${where}.responses.${code}`, 'error responses must be application/problem+json');
      }
    }

    if (['post', 'put', 'patch'].includes(method) && op.requestBody) {
      const { node } = await deref(op.requestBody, file);
      if (!node?.required) report('warn', `${where}.requestBody`, 'request body should be required');
    }

    if (query.has('page')) {
      const ok = await deref(responses['200'], file);
      const schema = ok.node?.content?.['application/json']?.schema;
      const parts = schema?.allOf || [];
      const hasMeta = parts.some((p) => typeof p.$ref === 'string' && p.$ref.endsWith('/PageMeta'));
      const hasItems = parts.some((p) => p.properties?.items?.type === 'array');
      if (!hasMeta || !hasItems) report('error', where, 'paginated responses must be PageMeta + items[]');
    }
  }
}

async function checkMoney(doc, file, report) {
  for await (const { node, trail } of walk(doc, file)) {
    if (!node.properties || typeof node.properties !== 'object') continue;
    for (const [name, prop] of Object.entries(node.properties)) {
      if (!MONEY_NAME.test(name) || !prop || prop.$ref || prop.type === 'object') continue;
      if (prop.type !== 'integer' || prop.format !== 'int64') {
        report('error', [...trail, 'properties', name].join('.'), 'money fields must be integer/int64 minor units');
      }
    }
  }
}

export async function lintFile(file, seenOperationIds = new Map()) {
  const findings = [];
  const report = (level, at, message) => findings.push({ file: path.basename(file), level, at, message });
  let doc;
  try {
    doc = await loadDoc(file);
  } catch (err) {
    report('error', '(parse)', err.message);
    return findings;
  }
  checkInfo(doc, report);
  await checkRefs(doc, file, report);
  await checkMoney(doc, file, report);
  if (path.basename(file) !== SHARED_FILE) {
    checkSecurity(doc, report);
    await checkOperations(doc, file, report, seenOperationIds);
  }
  return findings;
}

async function structuralValidate(file) {
  try {
    const { default: SwaggerParser } = await import('@apidevtools/swagger-parser');
    await SwaggerParser.validate(file);
    return [];
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') return [];
    return [{ file: path.basename(file), level: 'error', at: '(schema)', message: err.message }];
  }
}

export async function lintAll(files) {
  const seen = new Map();
  const findings = [];
  for (const file of files) {
    findings.push(...(await lintFile(file, seen)));
    if (path.basename(file) !== SHARED_FILE) findings.push(...(await structuralValidate(file)));
  }
  return findings;
}

async function main(argv) {
  const files = argv.length
    ? argv.map((f) => path.resolve(f))
    : (await readdir(SPEC_DIR)).filter((f) => f.endsWith('.yaml')).map((f) => path.join(SPEC_DIR, f));

  const findings = await lintAll(files);
  for (const f of findings) console.log(`${f.level.toUpperCase().padEnd(5)} ${f.file} ${f.at}: ${f.message}`);
  const errors = findings.filter((f) => f.level === 'error').length;
  console.log(`\n${files.length} spec(s) checked, ${errors} error(s), ${findings.length - errors} warning(s).`);
  return errors ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
```

## qa/swagger/scripts/lint-specs.test.mjs

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: javascript. Path: `qa/swagger/scripts/lint-specs.test.mjs`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintFile, resolveRef } from './lint-specs.mjs';

const SPECS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs');

async function fixture(body) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oas-lint-'));
  await copyFile(path.join(SPECS, 'common.yaml'), path.join(dir, 'common.yaml'));
  const file = path.join(dir, 'spec.yaml');
  await writeFile(file, body);
  return file;
}

const HEADER = `openapi: 3.0.3
info: { title: Fixture, version: 1.0.0 }
servers: [{ url: https://example.test }]
security: [{ bearerAuth: [] }]
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
`;

const messages = (findings) => findings.filter((f) => f.level === 'error').map((f) => f.message);

test('repository specs pass every house rule', async () => {
  const seen = new Map();
  for (const name of ['ecom-orders.yaml', 'uconnect-accounts-billing.yaml', 'iconnect-wholesale-orders.yaml', 'sdwan-edges.yaml']) {
    assert.deepEqual(messages(await lintFile(path.join(SPECS, name), seen)), [], name);
  }
});

test('resolves cross-file refs and reports missing ones', async () => {
  const from = path.join(SPECS, 'ecom-orders.yaml');
  assert.ok(await resolveRef('./common.yaml#/components/schemas/ProblemDetails', from));
  assert.equal(await resolveRef('./common.yaml#/components/schemas/Nope', from), null);
});

test('flags unversioned paths, undeclared path params and non-problem errors', async () => {
  const file = await fixture(`${HEADER}paths:
  /orders/{id}:
    get:
      operationId: getThing
      responses:
        '200': { description: ok }
        '404':
          description: missing
          content:
            application/json: { schema: { type: object } }
`);
  const errors = messages(await lintFile(file));
  assert.ok(errors.includes('paths must be versioned under /api/v1'));
  assert.ok(errors.includes('path parameter {id} is not declared'));
  assert.ok(errors.includes('error responses must be application/problem+json'));
});

test('rejects floating-point money and unpaired pagination', async () => {
  const file = await fixture(`${HEADER}paths:
  /api/v1/things:
    get:
      operationId: listThings
      parameters:
        - { name: page, in: query, schema: { type: integer } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalMinor: { type: number }
`);
  const errors = messages(await lintFile(file));
  assert.ok(errors.includes('money fields must be integer/int64 minor units'));
  assert.ok(errors.includes('page and pageSize must be declared together'));
});

test('detects duplicate operationIds across specs', async () => {
  const body = `${HEADER}paths:
  /api/v1/a:
    get:
      operationId: dup
      responses: { '200': { description: ok } }
`;
  const seen = new Map();
  await lintFile(await fixture(body), seen);
  const errors = messages(await lintFile(await fixture(body), seen));
  assert.ok(errors.some((m) => m.startsWith('operationId dup already used')));
});
```

## qa/swagger/specs/common.yaml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: yaml. Path: `qa/swagger/specs/common.yaml`.

```yaml
openapi: 3.0.3
info:
  title: Uniti shared API components
  version: 1.0.0
  description: >
    Components shared by every Uniti self-care API: RFC 7807 problem details,
    the `{ items, page, pageSize, total }` pagination envelope, money in integer
    minor units, correlation and idempotency headers. Referenced from the
    per-service specs; this document declares no paths of its own.
paths: {}
components:
  schemas:
    ProblemDetails:
      type: object
      description: RFC 7807 error body, served as `application/problem+json`.
      required: [type, title, status]
      properties:
        type:
          type: string
          format: uri-reference
          example: https://errors.uniti.com/problems/business-rule
        title:
          type: string
          example: Order cannot be cancelled
        status:
          type: integer
          minimum: 400
          maximum: 599
          example: 409
        detail:
          type: string
          example: Orders in PROVISIONING can no longer be cancelled online.
        instance:
          type: string
          format: uri-reference
          example: /api/v1/orders/GK-20261111-7HQ2XK/cancel
        code:
          type: string
          description: Stable machine-readable error code for client branching.
          example: ORDER_NOT_CANCELLABLE
        correlationId:
          type: string
          format: uuid
      additionalProperties: true

    ValidationProblem:
      allOf:
        - $ref: '#/components/schemas/ProblemDetails'
        - type: object
          required: [errors]
          properties:
            errors:
              type: array
              minItems: 1
              items:
                type: object
                required: [field, message]
                properties:
                  field:
                    type: string
                    example: contact.email
                  message:
                    type: string
                    example: must be a valid email address

    PageMeta:
      type: object
      required: [page, pageSize, total]
      properties:
        page:
          type: integer
          minimum: 1
        pageSize:
          type: integer
          minimum: 1
          maximum: 200
        total:
          type: integer
          minimum: 0

    Money:
      type: object
      description: Monetary amount. Never a floating-point number.
      required: [amountMinor, currency]
      properties:
        amountMinor:
          type: integer
          format: int64
          description: Amount in the currency's minor unit (cents/pence).
          example: 6999
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
          example: USD

    AccountId:
      type: string
      pattern: '^ACC-\d{8}$'
      example: ACC-00412398

    Timestamp:
      type: string
      format: date-time
      description: ISO-8601 UTC instant.
      example: '2026-11-11T09:30:00Z'

    PostalAddress:
      type: object
      required: [line1, city, postalCode]
      properties:
        line1:
          type: string
          minLength: 3
          maxLength: 120
        line2:
          type: string
          maxLength: 120
        city:
          type: string
          maxLength: 80
        state:
          type: string
          pattern: '^[A-Z]{2}$'
        postalCode:
          type: string
          maxLength: 10

  parameters:
    Page:
      name: page
      in: query
      schema:
        type: integer
        minimum: 1
        default: 1
    PageSize:
      name: pageSize
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 200
        default: 25
    CorrelationId:
      name: X-Correlation-Id
      in: header
      description: Propagated end to end; generated by the gateway when absent.
      schema:
        type: string
        format: uuid
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      description: >
        Client-generated key. A replay with the same key and body returns the
        original response; the same key with a different body returns 422.
      schema:
        type: string
        minLength: 16
        maxLength: 64
    AccountIdPath:
      name: accountId
      in: path
      required: true
      schema:
        $ref: '#/components/schemas/AccountId'

  headers:
    X-Correlation-Id:
      description: Echo of the request correlation id.
      schema:
        type: string
        format: uuid
    Retry-After:
      description: Seconds to wait before retrying.
      schema:
        type: integer
        minimum: 1

  responses:
    BadRequest:
      description: Malformed request or failed input validation.
      headers:
        X-Correlation-Id:
          $ref: '#/components/headers/X-Correlation-Id'
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ValidationProblem'
    Unauthorized:
      description: Missing, expired or invalid bearer token.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    Forbidden:
      description: Caller's role or account scope does not permit this operation.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    NotFound:
      description: Resource does not exist or is not visible to the caller.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    Conflict:
      description: Request conflicts with the current resource state.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    UnprocessableEntity:
      description: Well-formed request rejected by a business rule.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    TooManyRequests:
      description: Rate limit exceeded.
      headers:
        Retry-After:
          $ref: '#/components/headers/Retry-After'
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
    ServerError:
      description: Unexpected failure; quote the correlation id to support.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetails'
```

## qa/swagger/specs/ecom-orders.yaml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: yaml. Path: `qa/swagger/specs/ecom-orders.yaml`.

```yaml
openapi: 3.0.3
info:
  title: GoKinetic eCom - Checkout & Orders API
  version: 1.4.0
  description: >
    Storefront checkout and order tracking for GoKinetic (consumer) and Business
    GoKinetic. Orders follow `DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE`
    and may exit to `CANCELLED` or `FAILED`. All amounts are integer minor units.
servers:
  - url: https://api.gokinetic.com
    description: Production
  - url: https://api.staging.gokinetic.com
    description: Staging
security:
  - bearerAuth: []
tags:
  - name: Checkout
  - name: Orders

paths:
  /api/v1/checkout:
    post:
      tags: [Checkout]
      operationId: placeOrder
      summary: Convert a cart into an order and authorise payment
      description: >
        Re-checks serviceability, reserves hardware, creates the order in DRAFT,
        authorises `dueToday` against the payment token and submits it. Payment is
        captured only once the order reaches VALIDATED.
      parameters:
        - $ref: './common.yaml#/components/parameters/CorrelationId'
        - $ref: './common.yaml#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PlaceOrderRequest'
      responses:
        '201':
          description: Order created and submitted.
          headers:
            Location:
              schema:
                type: string
              example: /api/v1/orders/GK-20261111-7HQ2XK
            X-Correlation-Id:
              $ref: './common.yaml#/components/headers/X-Correlation-Id'
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '401':
          $ref: './common.yaml#/components/responses/Unauthorized'
        '402':
          description: Payment authorisation declined; the draft order is cancelled.
          content:
            application/problem+json:
              schema:
                $ref: './common.yaml#/components/schemas/ProblemDetails'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
        '422':
          $ref: './common.yaml#/components/responses/UnprocessableEntity'
        '429':
          $ref: './common.yaml#/components/responses/TooManyRequests'
        '500':
          $ref: './common.yaml#/components/responses/ServerError'

  /api/v1/orders:
    get:
      tags: [Orders]
      operationId: listOrders
      summary: List orders for the caller's account, newest first
      parameters:
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/OrderStatus'
      responses:
        '200':
          description: Page of order summaries.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/OrderSummary'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '401':
          $ref: './common.yaml#/components/responses/Unauthorized'

  /api/v1/orders/{orderNumber}:
    parameters:
      - $ref: '#/components/parameters/OrderNumber'
    get:
      tags: [Orders]
      operationId: getOrder
      summary: Get one order with pricing, payment and status history
      responses:
        '200':
          description: The order.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '401':
          $ref: './common.yaml#/components/responses/Unauthorized'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'

  /api/v1/orders/{orderNumber}/tracking:
    parameters:
      - $ref: '#/components/parameters/OrderNumber'
    get:
      tags: [Orders]
      operationId: trackOrder
      summary: Customer-facing milestone view of an order
      responses:
        '200':
          description: Ordered milestones with completion state.
          content:
            application/json:
              schema:
                type: object
                required: [orderNumber, status, milestones]
                properties:
                  orderNumber:
                    type: string
                  status:
                    $ref: '#/components/schemas/OrderStatus'
                  installAppointment:
                    allOf:
                      - $ref: './common.yaml#/components/schemas/Timestamp'
                    nullable: true
                  milestones:
                    type: array
                    items:
                      type: object
                      required: [key, label, state]
                      properties:
                        key:
                          type: string
                          example: PROVISIONING
                        label:
                          type: string
                          example: Connecting your service
                        state:
                          type: string
                          enum: [DONE, CURRENT, UPCOMING, SKIPPED]
                        at:
                          $ref: './common.yaml#/components/schemas/Timestamp'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'

  /api/v1/orders/{orderNumber}/cancel:
    parameters:
      - $ref: '#/components/parameters/OrderNumber'
    post:
      tags: [Orders]
      operationId: cancelOrder
      summary: Cancel an order that has not started provisioning
      description: Voids an authorised payment or refunds a captured one and releases reserved hardware.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [reason]
              properties:
                reason:
                  type: string
                  minLength: 3
                  maxLength: 500
      responses:
        '200':
          description: Order cancelled.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'

  /api/v1/orders/{orderNumber}/status:
    parameters:
      - $ref: '#/components/parameters/OrderNumber'
    post:
      tags: [Orders]
      operationId: advanceOrder
      summary: Move an order along its lifecycle (SUPPORT_AGENT only)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [status]
              properties:
                status:
                  $ref: '#/components/schemas/OrderStatus'
                reason:
                  type: string
                  maxLength: 500
      responses:
        '200':
          description: Transition applied.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: OIDC access token; roles CONSUMER, BUSINESS_ADMIN, BUSINESS_USER, SUPPORT_AGENT.

  parameters:
    OrderNumber:
      name: orderNumber
      in: path
      required: true
      schema:
        type: string
        pattern: '^GK-\d{8}-[A-Z0-9]{6}$'
        example: GK-20261111-7HQ2XK

  schemas:
    OrderStatus:
      type: string
      enum: [DRAFT, SUBMITTED, VALIDATED, PROVISIONING, ACTIVE, CANCELLED, FAILED]

    PaymentStatus:
      type: string
      enum: [PENDING, AUTHORIZED, CAPTURED, VOIDED, REFUNDED, FAILED, NOT_REQUIRED]

    PlaceOrderRequest:
      type: object
      required: [cartId, paymentToken, contact, acceptTerms]
      additionalProperties: false
      properties:
        cartId:
          type: string
          pattern: '^[a-f0-9]{24}$'
        paymentToken:
          type: string
          minLength: 8
          maxLength: 200
          description: Single-use token from the hosted payment fields; card data never reaches the API.
        billingAddress:
          $ref: './common.yaml#/components/schemas/PostalAddress'
        contact:
          type: object
          required: [email, phone, firstName, lastName]
          properties:
            email:
              type: string
              format: email
            phone:
              type: string
              pattern: '^\+?1?\d{10}$'
            firstName:
              type: string
              minLength: 1
              maxLength: 60
            lastName:
              type: string
              minLength: 1
              maxLength: 60
        preferredInstallDate:
          type: string
          format: date
        acceptTerms:
          type: boolean
          enum: [true]

    OrderItem:
      type: object
      required: [sku, name, productType, quantity, unitMonthly, unitOneTime, unitInstallation]
      properties:
        sku:
          type: string
          example: FIBER-1G
        name:
          type: string
        productType:
          type: string
          enum: [PLAN, ADDON, HARDWARE]
        quantity:
          type: integer
          minimum: 1
        unitMonthly:
          type: integer
          format: int64
        unitOneTime:
          type: integer
          format: int64
        unitInstallation:
          type: integer
          format: int64

    OrderSummary:
      type: object
      required: [orderNumber, accountId, status, segment, currency, dueToday, monthlyRecurring, createdAt]
      properties:
        orderNumber:
          type: string
        accountId:
          $ref: './common.yaml#/components/schemas/AccountId'
        status:
          $ref: '#/components/schemas/OrderStatus'
        segment:
          type: string
          enum: [CONSUMER, BUSINESS]
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
        dueToday:
          type: integer
          format: int64
          description: Minor units charged at checkout.
        monthlyRecurring:
          type: integer
          format: int64
          description: Minor units billed monthly after discounts.
        createdAt:
          $ref: './common.yaml#/components/schemas/Timestamp'

    Order:
      allOf:
        - $ref: '#/components/schemas/OrderSummary'
        - type: object
          required: [items, contractTermMonths, serviceAddress, payment, statusHistory]
          properties:
            items:
              type: array
              minItems: 1
              items:
                $ref: '#/components/schemas/OrderItem'
            contractTermMonths:
              type: integer
              enum: [0, 12, 24, 36]
            serviceAddress:
              $ref: './common.yaml#/components/schemas/PostalAddress'
            billingAddress:
              $ref: './common.yaml#/components/schemas/PostalAddress'
            promoCode:
              type: string
              nullable: true
            payment:
              type: object
              required: [status]
              properties:
                status:
                  $ref: '#/components/schemas/PaymentStatus'
                authorizedAmount:
                  type: integer
                  format: int64
                capturedAmount:
                  type: integer
                  format: int64
                refundedAmount:
                  type: integer
                  format: int64
                brand:
                  type: string
                  nullable: true
                last4:
                  type: string
                  pattern: '^\d{4}$'
                  nullable: true
            installAppointment:
              allOf:
                - $ref: './common.yaml#/components/schemas/Timestamp'
              nullable: true
            failureReason:
              type: string
              nullable: true
            cancellationReason:
              type: string
              nullable: true
            statusHistory:
              type: array
              items:
                type: object
                required: [to, at]
                properties:
                  from:
                    allOf:
                      - $ref: '#/components/schemas/OrderStatus'
                    nullable: true
                  to:
                    $ref: '#/components/schemas/OrderStatus'
                  at:
                    $ref: './common.yaml#/components/schemas/Timestamp'
                  actor:
                    type: string
                  reason:
                    type: string
```

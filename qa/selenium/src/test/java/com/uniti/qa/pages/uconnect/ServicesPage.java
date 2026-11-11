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

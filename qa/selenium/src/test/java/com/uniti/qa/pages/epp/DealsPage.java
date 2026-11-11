package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.LocalDate;
import java.util.ArrayList;
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
        List<DealRow> rows = new ArrayList<>();
        for (WebElement element : driver.findElements(ROWS)) {
            rows.add(new DealRow(element));
        }
        return rows;
    }

    public Optional<DealRow> rowFor(String customerName) {
        for (DealRow row : rows()) {
            if (row.customerName().equals(customerName)) {
                return Optional.of(row);
            }
        }
        return Optional.empty();
    }

    public boolean isEmpty() {
        return !driver.findElements(EMPTY_STATE).isEmpty();
    }

    public DealDetailPage open(String customerName) {
        Optional<DealRow> match = rowFor(customerName);
        if (match.isEmpty()) {
            throw new IllegalStateException("No deal row for " + customerName);
        }
        DealRow row = match.get();
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

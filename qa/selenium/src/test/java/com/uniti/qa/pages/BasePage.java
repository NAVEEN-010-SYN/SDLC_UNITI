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

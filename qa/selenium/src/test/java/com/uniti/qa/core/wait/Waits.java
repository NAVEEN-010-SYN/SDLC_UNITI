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
        FluentWait<WebDriver> wait = new FluentWait<>(driver);
        wait.withTimeout(timeout);
        wait.pollingEvery(polling);
        wait.ignoring(NoSuchElementException.class);
        wait.ignoring(StaleElementReferenceException.class);
        wait.withMessage(message);
        return wait;
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
        until(Waits::isSettled, "page settled (readyState complete, no pending requests)");
    }

    private static boolean isSettled(WebDriver d) {
        JavascriptExecutor js = (JavascriptExecutor) d;
        Object ready = js.executeScript("return document.readyState");
        Object pending = js.executeScript("return window.__pendingRequests === undefined ? 0 : window.__pendingRequests");
        return "complete".equals(ready) && toLong(pending) == 0L;
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

    private static long toLong(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        return -1L;
    }
}

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

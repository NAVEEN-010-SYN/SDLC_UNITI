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

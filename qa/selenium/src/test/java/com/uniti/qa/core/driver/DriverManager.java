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

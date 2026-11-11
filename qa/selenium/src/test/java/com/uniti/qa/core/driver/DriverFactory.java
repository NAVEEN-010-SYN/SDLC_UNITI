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

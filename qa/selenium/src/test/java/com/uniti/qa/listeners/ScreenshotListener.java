package com.uniti.qa.listeners;

import com.uniti.qa.core.config.TestConfig;
import com.uniti.qa.core.driver.DriverManager;
import io.qameta.allure.Allure;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.logging.LogEntries;
import org.openqa.selenium.logging.LogType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.ITestListener;
import org.testng.ITestResult;

/**
 * On failure, captures a screenshot, the page source and (Chromium only) browser console
 * logs. Artefacts are written to {@code target/failures/} and attached to Allure.
 */
public final class ScreenshotListener implements ITestListener {

    private static final Logger LOG = LoggerFactory.getLogger(ScreenshotListener.class);
    private static final Path OUTPUT = Paths.get("target", "failures");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    @Override
    public void onTestFailure(ITestResult result) {
        if (!TestConfig.get().boolValue("screenshot.on.failure", true)) {
            return;
        }
        DriverManager.current().ifPresent(driver -> capture(driver, result));
    }

    @Override
    public void onTestFailedButWithinSuccessPercentage(ITestResult result) {
        onTestFailure(result);
    }

    private void capture(WebDriver driver, ITestResult result) {
        String baseName = result.getTestClass().getRealClass().getSimpleName() + "."
                + result.getMethod().getMethodName() + "-" + STAMP.format(Instant.now());
        try {
            Files.createDirectories(OUTPUT);

            byte[] png = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
            Files.write(OUTPUT.resolve(baseName + ".png"), png);
            Allure.addAttachment("Screenshot", "image/png", new ByteArrayInputStream(png), "png");

            String source = driver.getPageSource();
            Files.writeString(OUTPUT.resolve(baseName + ".html"), source, StandardCharsets.UTF_8);
            Allure.addAttachment("Page source", "text/html", source, "html");

            Allure.addAttachment("URL", driver.getCurrentUrl());
            browserConsole(driver).ifPresent(log -> Allure.addAttachment("Browser console", "text/plain", log, "txt"));
            LOG.info("Saved failure artefacts for {} to {}", baseName, OUTPUT.toAbsolutePath());
        } catch (IOException | RuntimeException e) {
            LOG.warn("Could not capture failure artefacts for {}", baseName, e);
        }
    }

    private java.util.Optional<String> browserConsole(WebDriver driver) {
        try {
            LogEntries entries = driver.manage().logs().get(LogType.BROWSER);
            StringBuilder out = new StringBuilder();
            entries.forEach(entry -> out.append(Instant.ofEpochMilli(entry.getTimestamp()))
                    .append(' ').append(entry.getLevel()).append(' ').append(entry.getMessage()).append('\n'));
            return out.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(out.toString());
        } catch (RuntimeException unsupported) {
            return java.util.Optional.empty();
        }
    }
}

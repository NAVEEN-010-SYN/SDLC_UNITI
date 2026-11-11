package com.uniti.qa.listeners;

import com.uniti.qa.core.config.TestConfig;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.concurrent.atomic.AtomicInteger;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriverException;
import org.testng.IAnnotationTransformer;
import org.testng.IRetryAnalyzer;
import org.testng.ITestResult;
import org.testng.annotations.ITestAnnotation;

/**
 * Retries a failed test only for infrastructure-type failures (WebDriver/grid errors),
 * never for assertion failures, so genuine regressions are not masked. Registered for every
 * test via the nested {@link Transformer}.
 */
public final class RetryAnalyzer implements IRetryAnalyzer {

    private final AtomicInteger attempts = new AtomicInteger();
    private final int maxAttempts = TestConfig.get().intValue("retry.max.attempts", 1);

    @Override
    public boolean retry(ITestResult result) {
        Throwable cause = result.getThrowable();
        boolean infrastructure = cause instanceof WebDriverException
                && !(cause instanceof TimeoutException)
                && !(cause instanceof NoSuchElementException);
        return infrastructure && attempts.incrementAndGet() <= maxAttempts;
    }

    public static final class Transformer implements IAnnotationTransformer {
        @Override
        @SuppressWarnings("rawtypes")
        public void transform(ITestAnnotation annotation, Class testClass, Constructor testConstructor, Method testMethod) {
            annotation.setRetryAnalyzer(RetryAnalyzer.class);
        }
    }
}

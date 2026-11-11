package com.uniti.qa.listeners;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.uniti.qa.core.config.TestConfig;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testng.ISuite;
import org.testng.ISuiteListener;
import org.testng.ITestListener;
import org.testng.ITestResult;

/**
 * Writes a compact JSON run summary ({@code target/run-summary.json}) consumed by the CI
 * pipeline to post results and by the flaky-test tracker. Also logs one structured line
 * per test so console output is greppable.
 */
public final class ReportListener implements ITestListener, ISuiteListener {

    private static final Logger LOG = LoggerFactory.getLogger(ReportListener.class);
    private static final Path SUMMARY = Paths.get("target", "run-summary.json");

    private final ConcurrentLinkedQueue<Outcome> outcomes = new ConcurrentLinkedQueue<>();
    private Instant startedAt;

    record Outcome(String testClass, String method, String status, long durationMs, List<String> groups,
                   String failure, int attempt) {
    }

    record Summary(String environment, String browser, Instant startedAt, Instant finishedAt,
                   Map<String, Long> totals, List<Outcome> results) {
    }

    @Override
    public void onStart(ISuite suite) {
        startedAt = Instant.now();
        LOG.info("Suite '{}' starting against env={} browser={}", suite.getName(),
                TestConfig.get().environment(), TestConfig.get().browser());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        record(result, "PASSED");
    }

    @Override
    public void onTestFailure(ITestResult result) {
        record(result, "FAILED");
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        record(result, result.wasRetried() ? "RETRIED" : "SKIPPED");
    }

    private void record(ITestResult result, String status) {
        long duration = result.getEndMillis() - result.getStartMillis();
        String failure = result.getThrowable() == null ? null : result.getThrowable().getClass().getSimpleName()
                + ": " + result.getThrowable().getMessage();
        int attempt = result.getMethod().getCurrentInvocationCount();
        Outcome outcome = new Outcome(result.getTestClass().getRealClass().getSimpleName(),
                result.getMethod().getMethodName(), status, duration,
                List.of(result.getMethod().getGroups()), failure, attempt);
        outcomes.add(outcome);
        LOG.info("test={}.{} status={} durationMs={} attempt={}", outcome.testClass(), outcome.method(), status,
                duration, attempt);
    }

    @Override
    public void onFinish(ISuite suite) {
        Instant finished = Instant.now();
        Map<String, Long> totals = outcomes.stream()
                .collect(Collectors.groupingBy(Outcome::status, Collectors.counting()));
        Summary summary = new Summary(TestConfig.get().environment(), TestConfig.get().browser(),
                startedAt, finished, totals, List.copyOf(outcomes));
        ObjectMapper mapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .enable(SerializationFeature.INDENT_OUTPUT);
        try {
            Files.createDirectories(SUMMARY.getParent());
            mapper.writeValue(SUMMARY.toFile(), summary);
        } catch (IOException e) {
            LOG.error("Failed to write run summary", e);
        }
        LOG.info("Suite '{}' finished in {}s: {}", suite.getName(),
                Duration.between(startedAt, finished).toSeconds(), totals);
    }
}

package com.uniti.qa.core.config;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;

/**
 * Loads configuration in increasing order of precedence:
 * {@code config/default.properties} -> {@code config/<env>.properties} -> environment
 * variables -> JVM system properties. Secrets (passwords, grid tokens) are only ever
 * read from environment variables and never committed to properties files.
 */
public final class TestConfig {

    private static final TestConfig INSTANCE = load();

    private final Properties properties;
    private final String environment;

    private TestConfig(Properties properties, String environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public static TestConfig get() {
        return INSTANCE;
    }

    private static TestConfig load() {
        String env = System.getProperty("env", Optional.ofNullable(System.getenv("TEST_ENV")).orElse("dev"))
                .toLowerCase(Locale.ROOT);
        Properties props = new Properties();
        readInto(props, "config/default.properties", true);
        readInto(props, "config/" + env + ".properties", true);
        return new TestConfig(props, env);
    }

    private static void readInto(Properties target, String resource, boolean required) {
        try (InputStream in = TestConfig.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                if (required) {
                    throw new IllegalStateException("Missing configuration resource " + resource);
                }
                return;
            }
            target.load(in);
        } catch (IOException e) {
            throw new IllegalStateException("Unable to read " + resource, e);
        }
    }

    public String environment() {
        return environment;
    }

    /**
     * Resolves a key: system property wins, then an environment variable derived from the key
     * ({@code epp.base.url -> EPP_BASE_URL}), then the properties files.
     */
    public Optional<String> find(String key) {
        String sys = System.getProperty(key);
        if (sys != null && !sys.isBlank()) {
            return Optional.of(sys);
        }
        String envValue = System.getenv(toEnvName(key));
        if (envValue != null && !envValue.isBlank()) {
            return Optional.of(envValue);
        }
        return Optional.ofNullable(properties.getProperty(key)).filter(v -> !v.isBlank());
    }

    public String require(String key) {
        return find(key).orElseThrow(() -> new IllegalStateException(
                "Configuration '" + key + "' is not set (env var " + toEnvName(key) + ")"));
    }

    public int intValue(String key, int fallback) {
        return find(key).map(Integer::parseInt).orElse(fallback);
    }

    public boolean boolValue(String key, boolean fallback) {
        return find(key).map(Boolean::parseBoolean).orElse(fallback);
    }

    public Duration seconds(String key, long fallbackSeconds) {
        return Duration.ofSeconds(find(key).map(Long::parseLong).orElse(fallbackSeconds));
    }

    public URI eppBaseUrl() {
        return URI.create(require("epp.base.url"));
    }

    public URI uconnectBaseUrl() {
        return URI.create(require("uconnect.base.url"));
    }

    public String browser() {
        return find("browser").orElse("chrome");
    }

    public boolean headless() {
        return boolValue("headless", System.getenv("CI") != null);
    }

    public boolean remote() {
        return "grid".equalsIgnoreCase(find("execution").orElse("local"));
    }

    public URI gridUrl() {
        return URI.create(require("grid.url"));
    }

    public Duration explicitWait() {
        return seconds("wait.explicit.seconds", 15);
    }

    public Duration pageLoadTimeout() {
        return seconds("wait.pageload.seconds", 45);
    }

    public Credentials credentials(String persona) {
        Objects.requireNonNull(persona, "persona");
        String prefix = "persona." + persona.toLowerCase(Locale.ROOT);
        return new Credentials(require(prefix + ".username"), require(prefix + ".password"));
    }

    static String toEnvName(String key) {
        return key.toUpperCase(Locale.ROOT).replace('.', '_').replace('-', '_');
    }

    public record Credentials(String username, String password) {
        @Override
        public String toString() {
            return "Credentials[username=" + username + ", password=***]";
        }
    }
}

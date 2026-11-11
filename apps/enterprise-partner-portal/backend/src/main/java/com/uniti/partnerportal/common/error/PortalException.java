package com.uniti.partnerportal.common.error;

import org.springframework.http.HttpStatus;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Base type for every business error raised by the services. Each carries a stable machine
 * readable {@code code} (used by the UI to pick a message) and the HTTP status it maps to.
 */
public abstract class PortalException extends RuntimeException {

    private final String code;
    private final HttpStatus status;
    private final Map<String, Object> details = new LinkedHashMap<>();

    protected PortalException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public PortalException withDetail(String key, Object value) {
        details.put(key, value);
        return this;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public Map<String, Object> getDetails() {
        return Collections.unmodifiableMap(details);
    }

    public static final class NotFound extends PortalException {
        public NotFound(String resource, Object id) {
            super(HttpStatus.NOT_FOUND, "resource.not_found", resource + " " + id + " was not found");
            withDetail("resource", resource);
            withDetail("id", String.valueOf(id));
        }
    }

    public static final class BusinessRule extends PortalException {
        public BusinessRule(String code, String message) {
            super(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
        }
    }

    public static final class Conflict extends PortalException {
        public Conflict(String code, String message) {
            super(HttpStatus.CONFLICT, code, message);
        }
    }

    public static final class Forbidden extends PortalException {
        public Forbidden(String message) {
            super(HttpStatus.FORBIDDEN, "access.forbidden", message);
        }
    }

    public static final class InvalidTransition extends PortalException {
        public InvalidTransition(String entity, Enum<?> from, Enum<?> to) {
            super(HttpStatus.CONFLICT, "state.invalid_transition",
                    entity + " cannot move from " + from + " to " + to);
            withDetail("from", from.name());
            withDetail("to", to.name());
        }
    }
}

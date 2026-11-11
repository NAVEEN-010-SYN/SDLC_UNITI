package com.uniti.partnerportal.common.web;

import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.money.Money;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Translates every failure into an RFC 7807 {@code application/problem+json} body. Each problem
 * carries the correlation ID so a partner can quote it to the channel desk, and validation
 * failures enumerate the offending fields so forms can highlight them.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final String TYPE_BASE = "https://errors.uniti.example/partner-portal/";

    @ExceptionHandler(PortalException.class)
    public ProblemDetail handlePortal(PortalException ex, HttpServletRequest request) {
        ProblemDetail problem = base(ex.getStatus(), ex.getCode(), ex.getMessage(), request);
        ex.getDetails().forEach(problem::setProperty);
        if (ex.getStatus().is5xxServerError()) {
            log.error("portal_error code={}", ex.getCode(), ex);
        } else {
            log.info("portal_rejection code={} message={}", ex.getCode(), ex.getMessage());
        }
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        ProblemDetail problem = base(HttpStatus.BAD_REQUEST, "request.invalid",
                "One or more fields are invalid", request);
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::fieldError)
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ProblemDetail handleConstraint(ConstraintViolationException ex, HttpServletRequest request) {
        ProblemDetail problem = base(HttpStatus.BAD_REQUEST, "request.invalid",
                "One or more parameters are invalid", request);
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(v -> Map.of("field", v.getPropertyPath().toString(), "message", v.getMessage()))
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ProblemDetail handleUnreadable(Exception ex, HttpServletRequest request) {
        return base(HttpStatus.BAD_REQUEST, "request.malformed",
                "The request could not be read: " + rootMessage(ex), request);
    }

    @ExceptionHandler(Money.CurrencyMismatchException.class)
    public ProblemDetail handleCurrency(Money.CurrencyMismatchException ex, HttpServletRequest request) {
        return base(HttpStatus.UNPROCESSABLE_ENTITY, "money.currency_mismatch", ex.getMessage(), request);
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail handleOptimisticLock(OptimisticLockingFailureException ex, HttpServletRequest request) {
        return base(HttpStatus.CONFLICT, "resource.concurrent_modification",
                "The record was changed by someone else. Reload and try again.", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return base(HttpStatus.FORBIDDEN, "access.forbidden",
                "You do not have permission to perform this action", request);
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("unhandled_exception path={}", request.getRequestURI(), ex);
        return base(HttpStatus.INTERNAL_SERVER_ERROR, "internal.error",
                "An unexpected error occurred. Quote the correlation ID when contacting support.", request);
    }

    private static ProblemDetail base(HttpStatus status, String code, String detail, HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create(TYPE_BASE + code.replace('.', '/')));
        problem.setTitle(status.getReasonPhrase());
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("correlationId", CorrelationIdFilter.current());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    private static Map<String, String> fieldError(FieldError error) {
        String message = error.getDefaultMessage() == null ? "is invalid" : error.getDefaultMessage();
        return Map.of("field", error.getField(), "message", message);
    }

    private static String rootMessage(Throwable ex) {
        Throwable root = ex;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        if (message == null) {
            return root.getClass().getSimpleName();
        }
        return message.length() > 200 ? message.substring(0, 200) : message;
    }
}

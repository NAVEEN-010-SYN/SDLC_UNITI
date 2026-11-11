using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Controllers;
using Uconnect.Api.Http;
using Uconnect.Api.Security;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Tickets;

namespace Uconnect.Tests.Api;

public sealed class ProblemDetailsMappingTests
{
    public static TheoryData<Exception, int, string> Cases => new()
    {
        { new NotFoundException("Invoice", "INV-1"), 404, "invoice.not_found" },
        { new ForbiddenException("no"), 403, "forbidden" },
        { new ConflictException("payment.idempotency_key_reused", "reused"), 409, "payment.idempotency_key_reused" },
        { new PaymentDeclinedException(Guid.NewGuid(), "card_declined", null), 402, "payment.declined" },
        { new ExternalServiceException("payments", "down", isTransient: true), 503, "payments.unavailable" },
        { new ExternalServiceException("payments", "bad", isTransient: false), 502, "payments.unavailable" },
        { new InvalidStateTransitionException("Ticket", "Closed", "Open"), 409, "ticket.invalid_transition" },
        { new DomainException("invoice.overpayment", "too much"), 422, "invoice.overpayment" },
        { new InvalidOperationException("secret detail"), 500, "internal_error" },
    };

    [Theory]
    [MemberData(nameof(Cases))]
    public void Maps_exceptions_to_status_and_stable_code(Exception exception, int status, string code)
    {
        var problem = ProblemDetailsExceptionHandler.Map(exception);

        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Extensions["code"]);
    }

    [Fact]
    public void Validation_errors_are_returned_per_field()
    {
        var problem = Assert.IsType<ValidationProblemDetails>(ProblemDetailsExceptionHandler.Map(new RequestValidationException("amount", "Too high.")));

        Assert.Equal(new[] { "Too high." }, problem.Errors["amount"]);
    }

    [Fact]
    public void Unexpected_errors_do_not_leak_details() =>
        Assert.DoesNotContain("secret", ProblemDetailsExceptionHandler.Map(new InvalidOperationException("secret detail")).Detail);
}

public sealed class ProvisioningWebhookSignatureTests
{
    private static readonly WebhookOptions Options = new() { ProvisioningSecret = "s3cret", MaxAgeSeconds = 300 };
    private static readonly DateTimeOffset Now = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);

    private static string Sign(long timestamp, string body) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options.ProvisioningSecret), Encoding.UTF8.GetBytes($"{timestamp}.{body}")));

    [Fact]
    public void Accepts_a_fresh_correctly_signed_callback()
    {
        var ts = Now.ToUnixTimeSeconds();
        Assert.True(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts, "{}"), ts, Options, Now));
    }

    [Fact]
    public void Rejects_tampered_bodies_stale_timestamps_and_garbage()
    {
        var ts = Now.ToUnixTimeSeconds();
        Assert.False(ProvisioningWebhookController.IsAuthentic("{\"state\":\"Completed\"}", Sign(ts, "{}"), ts, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts - 600, "{}"), ts - 600, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", "not-hex", ts, Options, Now));
        Assert.False(ProvisioningWebhookController.IsAuthentic("{}", Sign(ts, "{}"), ts, new WebhookOptions(), Now));
    }
}

public sealed class BoundaryHelperTests
{
    [Theory]
    [InlineData("4f1c2a", true)]
    [InlineData("job-plan-changes.1", true)]
    [InlineData("bad id with spaces", false)]
    [InlineData("line\nbreak", false)]
    [InlineData("", false)]
    public void Only_safe_correlation_ids_are_propagated(string value, bool accepted) =>
        Assert.Equal(accepted, CorrelationIdMiddleware.IsAcceptable(value));

    [Fact]
    public void Same_subject_always_maps_to_the_same_user_id()
    {
        Assert.Equal(HttpCurrentUser.SubjectToUserId("auth0|abc"), HttpCurrentUser.SubjectToUserId("auth0|abc"));
        Assert.NotEqual(HttpCurrentUser.SubjectToUserId("auth0|abc"), HttpCurrentUser.SubjectToUserId("auth0|abd"));
        Assert.Equal(Guid.Empty, HttpCurrentUser.SubjectToUserId(string.Empty));
    }

    [Theory]
    [InlineData("IN_PROGRESS", TicketStatus.InProgress)]
    [InlineData("inprogress", TicketStatus.InProgress)]
    [InlineData("PendingCustomer", TicketStatus.PendingCustomer)]
    public void Enum_names_accept_api_and_convention_spellings(string value, TicketStatus expected) =>
        Assert.Equal(expected, EnumParsing.Parse<TicketStatus>(value, "status"));

    [Theory]
    [InlineData("2")]
    [InlineData("-1")]
    [InlineData("Unknown")]
    [InlineData(null)]
    public void Enum_ordinals_and_unknown_names_are_rejected(string? value) =>
        Assert.False(EnumParsing.TryParse<TicketStatus>(value, out _));
}

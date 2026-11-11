using System.Net;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>
/// Card / direct-debit gateway. A decline is a normal business outcome (HTTP 402) and is returned as
/// a result, not thrown. Every charge and refund carries an <c>Idempotency-Key</c> header so the
/// resilience pipeline's retries can never double-charge.
/// </summary>
internal sealed class PaymentGatewayClient : IPaymentGateway
{
    private const string System = ExternalSystems.PaymentGateway;

    private readonly HttpClient _http;

    public PaymentGatewayClient(HttpClient http) => _http = http;

    public async Task<GatewayInstrument> DescribeTokenAsync(string paymentToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"v1/tokens/{Uri.EscapeDataString(paymentToken)}");
        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            response.Dispose();
            throw new RequestValidationException("paymentToken", "The payment token is unknown or has expired.");
        }

        var token = await ExternalHttp.ReadAsync<TokenResponse>(response, System, ct);
        var type = token.Kind switch
        {
            "card" => PaymentMethodType.Card,
            "bacs_debit" => PaymentMethodType.DirectDebit,
            _ => throw new RequestValidationException("paymentToken", "This kind of payment method is not supported."),
        };
        return new GatewayInstrument(type, token.Label, token.Last4, token.ExpiryMonth, token.ExpiryYear);
    }

    public async Task<GatewayChargeResult> ChargeAsync(GatewayChargeRequest charge, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "v1/charges", new ChargeBody(
            charge.PaymentToken, charge.Amount.AmountMinor, charge.Amount.Currency, charge.Description, charge.AccountNumber));
        request.Headers.Add("Idempotency-Key", charge.IdempotencyKey);

        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.PaymentRequired);
        var declined = response.StatusCode == HttpStatusCode.PaymentRequired;
        var body = await ExternalHttp.ReadAsync<ChargeResponse>(response, System, ct);
        return declined || body.Status != "succeeded"
            ? GatewayChargeResult.Declined(body.FailureCode ?? "declined", body.FailureMessage)
            : GatewayChargeResult.Success(body.Id);
    }

    public async Task<GatewayRefundResult> RefundAsync(string chargeReference, Money amount, string idempotencyKey, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "v1/refunds", new RefundBody(chargeReference, amount.AmountMinor, amount.Currency));
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.UnprocessableEntity);
        var body = await ExternalHttp.ReadAsync<RefundResponse>(response, System, ct);
        return new GatewayRefundResult(body.Status == "succeeded", body.Id, body.FailureCode);
    }

    private sealed record TokenResponse(string Kind, string Label, string Last4, int? ExpiryMonth, int? ExpiryYear);

    private sealed record ChargeBody(string Source, long AmountMinor, string Currency, string Description, string CustomerReference);

    private sealed record ChargeResponse(string Id, string Status, string? FailureCode, string? FailureMessage);

    private sealed record RefundBody(string Charge, long AmountMinor, string Currency);

    private sealed record RefundResponse(string? Id, string Status, string? FailureCode);
}

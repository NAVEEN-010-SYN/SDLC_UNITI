using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Security;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Application.Usage;

namespace Uconnect.Api.Controllers;

public sealed class InvoicesController : AccountScopedController
{
    private readonly InvoiceService _invoices;
    private readonly AdjustmentService _adjustments;

    public InvoicesController(InvoiceService invoices, AdjustmentService adjustments)
    {
        _invoices = invoices;
        _adjustments = adjustments;
    }

    [HttpGet("invoices")]
    public Task<PagedResult<InvoiceSummaryDto>> List(string accountNumber, [FromQuery] string? status, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _invoices.ListAsync(accountNumber, status, Page(page, pageSize), ct);

    [HttpGet("invoices/{invoiceNumber}")]
    public Task<InvoiceDetailDto> Get(string accountNumber, string invoiceNumber, CancellationToken ct) =>
        _invoices.GetAsync(accountNumber, invoiceNumber, ct);

    [HttpGet("invoices/{invoiceNumber}/pdf")]
    [Produces("application/pdf")]
    public async Task<IActionResult> Pdf(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var document = await _invoices.GetPdfAsync(accountNumber, invoiceNumber, ct);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("balance")]
    public Task<AccountBalanceDto> Balance(string accountNumber, CancellationToken ct) => _invoices.GetBalanceAsync(accountNumber, ct);

    [HttpGet("adjustments")]
    public Task<IReadOnlyList<AdjustmentDto>> ListAdjustments(string accountNumber, CancellationToken ct) => _adjustments.ListAsync(accountNumber, ct);

    [HttpPost("adjustments")]
    [Authorize(Policy = Policies.SupportAgent)]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<AdjustmentDto>> RaiseAdjustment(string accountNumber, RaiseAdjustmentRequest request, CancellationToken ct)
    {
        var adjustment = await _adjustments.RaiseAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/adjustments", adjustment);
    }
}

public sealed class PaymentsController : AccountScopedController
{
    private readonly PaymentService _payments;
    private readonly PaymentMethodService _methods;

    public PaymentsController(PaymentService payments, PaymentMethodService methods)
    {
        _payments = payments;
        _methods = methods;
    }

    /// <summary>Pays an invoice. Send a unique <c>Idempotency-Key</c> per payment attempt and reuse it on retry.</summary>
    [HttpPost("invoices/{invoiceNumber}/payments")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status402PaymentRequired)]
    public async Task<ActionResult<PaymentDto>> Pay(
        string accountNumber, string invoiceNumber, PayInvoiceRequest request, [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey, CancellationToken ct)
    {
        var payment = await _payments.PayInvoiceAsync(accountNumber, invoiceNumber, request, idempotencyKey, ct);
        return Created($"/api/v1/accounts/{accountNumber}/payments/{payment.Id}", payment);
    }

    [HttpGet("payments")]
    public Task<PagedResult<PaymentDto>> List(string accountNumber, [FromQuery] int? page, [FromQuery] int? pageSize, CancellationToken ct) =>
        _payments.ListAsync(accountNumber, Page(page, pageSize), ct);

    [HttpPost("payments/{paymentId:guid}/refunds")]
    [Authorize(Policy = Policies.SupportAgent)]
    public Task<PaymentDto> Refund(string accountNumber, Guid paymentId, RefundPaymentRequest request, CancellationToken ct) =>
        _payments.RefundAsync(accountNumber, paymentId, request, ct);

    [HttpGet("payment-methods")]
    public Task<IReadOnlyList<PaymentMethodDto>> ListMethods(string accountNumber, CancellationToken ct) => _methods.ListAsync(accountNumber, ct);

    [HttpPost("payment-methods")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<PaymentMethodDto>> AddMethod(string accountNumber, AddPaymentMethodRequest request, CancellationToken ct)
    {
        var method = await _methods.AddAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/payment-methods/{method.Id}", method);
    }

    [HttpPost("payment-methods/{methodId:guid}/default")]
    public Task<IReadOnlyList<PaymentMethodDto>> MakeDefault(string accountNumber, Guid methodId, CancellationToken ct) =>
        _methods.SetDefaultAsync(accountNumber, methodId, ct);

    [HttpDelete("payment-methods/{methodId:guid}")]
    public async Task<IActionResult> RemoveMethod(string accountNumber, Guid methodId, CancellationToken ct)
    {
        await _methods.RemoveAsync(accountNumber, methodId, ct);
        return NoContent();
    }

    [HttpGet("autopay")]
    public Task<AutopayDto> GetAutopay(string accountNumber, CancellationToken ct) => _methods.GetAutopayAsync(accountNumber, ct);

    [HttpPut("autopay")]
    public Task<AutopayDto> UpdateAutopay(string accountNumber, UpdateAutopayRequest request, CancellationToken ct) =>
        _methods.UpdateAutopayAsync(accountNumber, request, ct);
}

public sealed class UsageController : AccountScopedController
{
    private readonly UsageService _usage;

    public UsageController(UsageService usage) => _usage = usage;

    /// <summary>Usage for the billing cycle containing <paramref name="period"/> (ISO date; defaults to today).</summary>
    [HttpGet("services/{serviceId:guid}/usage")]
    public Task<UsageSummaryDto> Summary(string accountNumber, Guid serviceId, [FromQuery] DateOnly? period, CancellationToken ct) =>
        _usage.GetSummaryAsync(accountNumber, serviceId, period, ct);
}

[ApiController]
[Route("api/v1/usage/records")]
[Authorize(Policy = Policies.UsageIngest)]
public sealed class UsageIngestController : ControllerBase
{
    private readonly UsageService _usage;

    public UsageIngestController(UsageService usage) => _usage = usage;

    [HttpPost]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public Task<UsageIngestResult> Ingest(IngestUsageRequest request, CancellationToken ct) => _usage.IngestAsync(request, ct);
}

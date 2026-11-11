using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Uconnect.Application.Abstractions;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>Network OSS: plan re-profile orders, idempotent on the plan change id.</summary>
internal sealed class ProvisioningClient : IProvisioningClient
{
    private const string System = ExternalSystems.Provisioning;

    private readonly HttpClient _http;

    public ProvisioningClient(HttpClient http) => _http = http;

    public async Task<ProvisioningOrderAccepted> SubmitPlanChangeAsync(ProvisioningOrderRequest order, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "orders/plan-change", order);
        request.Headers.Add("Idempotency-Key", order.PlanChangeId.ToString("N"));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<ProvisioningOrderAccepted>(response, System, ct);
    }

    public async Task<ProvisioningOrderStatus> GetOrderStatusAsync(string orderRef, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"orders/{Uri.EscapeDataString(orderRef)}");
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<ProvisioningOrderStatus>(response, System, ct);
    }
}

/// <summary>Finance ledger: receives issued invoices and renders their PDFs.</summary>
internal sealed class BillingSystemClient : IBillingSystemClient
{
    private const string System = ExternalSystems.BillingSystem;

    private readonly HttpClient _http;

    public BillingSystemClient(HttpClient http) => _http = http;

    public async Task PostInvoiceAsync(Invoice invoice, string accountNumber, CancellationToken ct)
    {
        var body = new LedgerInvoice(
            invoice.InvoiceNumber,
            accountNumber,
            invoice.Currency,
            invoice.PeriodStart,
            invoice.PeriodEnd,
            invoice.IssuedOn,
            invoice.DueOn,
            invoice.Subtotal.AmountMinor,
            invoice.TaxTotal.AmountMinor,
            invoice.Total.AmountMinor,
            invoice.TaxRateBasisPoints,
            invoice.Lines.Select(l => new LedgerLine(l.Type.ToString(), l.Description, l.Quantity, l.UnitAmount.AmountMinor, l.Amount.AmountMinor, l.Taxable)).ToList());

        using var request = ExternalHttp.Json(HttpMethod.Put, $"invoices/{Uri.EscapeDataString(invoice.InvoiceNumber)}", body);
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }

    public async Task<InvoiceDocument?> GetInvoicePdfAsync(string invoiceNumber, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"invoices/{Uri.EscapeDataString(invoiceNumber)}/pdf");
        using var response = await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        var content = await response.Content.ReadAsByteArrayAsync(ct);
        return new InvoiceDocument($"{invoiceNumber}.pdf", "application/pdf", content);
    }

    private sealed record LedgerLine(string Type, string Description, int Quantity, long UnitAmountMinor, long AmountMinor, bool Taxable);

    private sealed record LedgerInvoice(
        string InvoiceNumber,
        string AccountNumber,
        string Currency,
        DateOnly PeriodStart,
        DateOnly PeriodEnd,
        DateOnly? IssuedOn,
        DateOnly? DueOn,
        long SubtotalMinor,
        long TaxMinor,
        long TotalMinor,
        int TaxRateBasisPoints,
        IReadOnlyList<LedgerLine> Lines);
}

/// <summary>Engineer workforce management: capacity by postcode district and work orders.</summary>
internal sealed class FieldServiceClient : IFieldServiceClient
{
    private const string System = ExternalSystems.FieldService;

    private readonly HttpClient _http;

    public FieldServiceClient(HttpClient http) => _http = http;

    public async Task<IReadOnlyDictionary<AppointmentSlot, int>> GetCapacityAsync(
        string outwardCode, IReadOnlyCollection<AppointmentSlot> slots, CancellationToken ct)
    {
        if (slots.Count == 0)
        {
            return new Dictionary<AppointmentSlot, int>();
        }

        var query = new CapacityQuery(outwardCode, slots.Min(s => s.Date), slots.Max(s => s.Date));
        using var request = ExternalHttp.Json(HttpMethod.Post, "capacity/query", query);
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        var rows = await ExternalHttp.ReadAsync<List<CapacityRow>>(response, System, ct);

        var requested = slots.ToHashSet();
        return rows
            .Select(r => (Slot: new AppointmentSlot(r.Date, r.Window), r.Remaining))
            .Where(r => requested.Contains(r.Slot))
            .GroupBy(r => r.Slot)
            .ToDictionary(g => g.Key, g => g.Sum(r => Math.Max(0, r.Remaining)));
    }

    public async Task<WorkOrderConfirmation> CreateWorkOrderAsync(WorkOrderRequest order, CancellationToken ct)
    {
        var body = new WorkOrderBody(
            order.AppointmentReference,
            order.Type,
            order.Slot.Date,
            order.Slot.Window,
            order.Slot.StartsAtUtc,
            order.Slot.EndsAtUtc,
            new AddressBody(order.Address.Line1, order.Address.Line2, order.Address.Town, order.Address.Postcode),
            order.ContactName,
            order.ContactPhone,
            order.AccessNotes);
        using var request = ExternalHttp.Json(HttpMethod.Post, "work-orders", body);
        request.Headers.Add("Idempotency-Key", order.AppointmentId.ToString("N"));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<WorkOrderConfirmation>(response, System, ct);
    }

    public async Task<WorkOrderConfirmation> RescheduleWorkOrderAsync(string workOrderRef, AppointmentSlot newSlot, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(
            HttpMethod.Put, $"work-orders/{Uri.EscapeDataString(workOrderRef)}/slot", new SlotBody(newSlot.Date, newSlot.Window, newSlot.StartsAtUtc, newSlot.EndsAtUtc));
        var response = await ExternalHttp.SendAsync(_http, System, request, ct);
        return await ExternalHttp.ReadAsync<WorkOrderConfirmation>(response, System, ct);
    }

    public async Task CancelWorkOrderAsync(string workOrderRef, string reason, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, $"work-orders/{Uri.EscapeDataString(workOrderRef)}/cancel", new { reason });

        // Already cancelled or unknown at the field system is the outcome we wanted.
        (await ExternalHttp.SendAsync(_http, System, request, ct, HttpStatusCode.NotFound, HttpStatusCode.Conflict)).Dispose();
    }

    private sealed record CapacityQuery(string OutwardCode, DateOnly From, DateOnly To);

    private sealed record CapacityRow(DateOnly Date, AppointmentWindow Window, int Remaining);

    private sealed record AddressBody(string Line1, string? Line2, string Town, string Postcode);

    private sealed record SlotBody(DateOnly Date, AppointmentWindow Window, DateTimeOffset StartsAt, DateTimeOffset EndsAt);

    private sealed record WorkOrderBody(
        string Reference,
        AppointmentType Type,
        DateOnly Date,
        AppointmentWindow Window,
        DateTimeOffset StartsAt,
        DateTimeOffset EndsAt,
        AddressBody Address,
        string ContactName,
        string ContactPhone,
        string? AccessNotes);
}

/// <summary>Group messaging service; implements both e-mail and SMS delivery.</summary>
internal sealed class NotificationServiceClient : IEmailSender, ISmsSender
{
    private const string System = ExternalSystems.Notifications;

    private readonly HttpClient _http;

    public NotificationServiceClient(HttpClient http) => _http = http;

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        using var request = ExternalHttp.Json(HttpMethod.Post, "email", new
        {
            to = message.To,
            subject = message.Subject,
            html = message.HtmlBody,
            text = message.TextBody,
            correlationId = message.CorrelationId ?? CorrelationContext.CorrelationId,
        });
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }

    public async Task SendAsync(PhoneNumber to, string text, CancellationToken ct)
    {
        var body = text.Length > 300 ? text[..300] : text;
        using var request = new HttpRequestMessage(HttpMethod.Post, "sms")
        {
            Content = JsonContent.Create(new { to = to.Value, text = body, sentAt = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture) }, options: ExternalHttp.SerializerOptions),
        };
        (await ExternalHttp.SendAsync(_http, System, request, ct)).Dispose();
    }
}

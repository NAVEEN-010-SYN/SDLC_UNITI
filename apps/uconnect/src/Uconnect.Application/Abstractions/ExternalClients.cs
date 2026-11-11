using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Abstractions;

// ---------------------------------------------------------------- Provisioning

/// <summary>Order sent to the network provisioning platform to re-profile a service.</summary>
public sealed record ProvisioningOrderRequest(
    Guid PlanChangeId,
    string ServiceReference,
    string FromPlanCode,
    string ToPlanCode,
    int DownloadMbps,
    int UploadMbps,
    DateOnly EffectiveOn);

public sealed record ProvisioningOrderAccepted(string OrderRef);

public enum ProvisioningOrderState
{
    Pending,
    Completed,
    Failed,
}

public sealed record ProvisioningOrderStatus(string OrderRef, ProvisioningOrderState State, string? FailureReason, DateTimeOffset? CompletedAt);

/// <summary>Client for the network provisioning platform (OSS).</summary>
public interface IProvisioningClient
{
    /// <summary>Submits a re-profile order. Idempotent on <see cref="ProvisioningOrderRequest.PlanChangeId"/>.</summary>
    Task<ProvisioningOrderAccepted> SubmitPlanChangeAsync(ProvisioningOrderRequest request, CancellationToken ct);

    Task<ProvisioningOrderStatus> GetOrderStatusAsync(string orderRef, CancellationToken ct);
}

// ---------------------------------------------------------------- Payment gateway

public sealed record GatewayChargeRequest(string PaymentToken, Money Amount, string IdempotencyKey, string Description, string AccountNumber);

public sealed record GatewayChargeResult(bool Succeeded, string? Reference, string? FailureCode, string? FailureMessage)
{
    public static GatewayChargeResult Success(string reference) => new(true, reference, null, null);

    public static GatewayChargeResult Declined(string code, string? message) => new(false, null, code, message);
}

public sealed record GatewayRefundResult(bool Succeeded, string? Reference, string? FailureCode);

/// <summary>Details of a tokenised instrument, read from the gateway (never trusted from the browser).</summary>
public sealed record GatewayInstrument(PaymentMethodType Type, string Label, string Last4, int? ExpiryMonth, int? ExpiryYear);

/// <summary>Card/direct-debit payment gateway. All amounts in minor units.</summary>
public interface IPaymentGateway
{
    Task<GatewayInstrument> DescribeTokenAsync(string paymentToken, CancellationToken ct);

    Task<GatewayChargeResult> ChargeAsync(GatewayChargeRequest request, CancellationToken ct);

    Task<GatewayRefundResult> RefundAsync(string chargeReference, Money amount, string idempotencyKey, CancellationToken ct);
}

// ---------------------------------------------------------------- Billing system (ERP / ledger)

public sealed record InvoiceDocument(string FileName, string ContentType, byte[] Content);

/// <summary>Downstream finance system: receives issued invoices for the ledger and renders invoice PDFs.</summary>
public interface IBillingSystemClient
{
    Task PostInvoiceAsync(Domain.Billing.Invoice invoice, string accountNumber, CancellationToken ct);

    Task<InvoiceDocument?> GetInvoicePdfAsync(string invoiceNumber, CancellationToken ct);
}

// ---------------------------------------------------------------- Field service (engineer scheduling)

public sealed record WorkOrderRequest(
    Guid AppointmentId,
    string AppointmentReference,
    AppointmentType Type,
    AppointmentSlot Slot,
    PostalAddress Address,
    string ContactName,
    string ContactPhone,
    string? AccessNotes);

public sealed record WorkOrderConfirmation(string WorkOrderRef, string? EngineerName);

/// <summary>Engineer workforce management system.</summary>
public interface IFieldServiceClient
{
    /// <summary>Remaining capacity per slot for the outward code.</summary>
    Task<IReadOnlyDictionary<AppointmentSlot, int>> GetCapacityAsync(string outwardCode, IReadOnlyCollection<AppointmentSlot> slots, CancellationToken ct);

    Task<WorkOrderConfirmation> CreateWorkOrderAsync(WorkOrderRequest request, CancellationToken ct);

    Task<WorkOrderConfirmation> RescheduleWorkOrderAsync(string workOrderRef, AppointmentSlot newSlot, CancellationToken ct);

    Task CancelWorkOrderAsync(string workOrderRef, string reason, CancellationToken ct);
}

// ---------------------------------------------------------------- Messaging

public sealed record EmailMessage(string To, string Subject, string HtmlBody, string TextBody, string? CorrelationId = null);

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public interface ISmsSender
{
    Task SendAsync(PhoneNumber to, string text, CancellationToken ct);
}

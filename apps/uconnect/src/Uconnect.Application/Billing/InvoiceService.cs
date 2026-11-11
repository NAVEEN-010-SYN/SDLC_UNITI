using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Billing;

/// <summary>
/// Customer view of invoices: history, detail with lines and payments, PDF download and the
/// current balance. Draft invoices are internal to the billing run and only visible to agents.
/// </summary>
public sealed class InvoiceService
{
    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IServiceRepository _services;
    private readonly IBillingSystemClient _billingSystem;
    private readonly ICurrentUser _currentUser;
    private readonly IClock _clock;

    public InvoiceService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IServiceRepository services,
        IBillingSystemClient billingSystem,
        ICurrentUser currentUser,
        IClock clock)
    {
        _guard = guard;
        _invoices = invoices;
        _payments = payments;
        _services = services;
        _billingSystem = billingSystem;
        _currentUser = currentUser;
        _clock = clock;
    }

    public async Task<PagedResult<InvoiceSummaryDto>> ListAsync(string accountNumber, string? status, PageRequest page, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        InvoiceStatus? filter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = EnumParsing.Parse<InvoiceStatus>(status, "status");
            if (parsed == InvoiceStatus.Draft && !_currentUser.IsSupportAgent)
            {
                throw new RequestValidationException("status", "Draft invoices are not available.");
            }

            filter = parsed;
        }

        var result = await _invoices.ListByAccountAsync(account.Id, filter, page, ct);
        var today = _clock.Today;
        return result.Map(i => i.ToSummaryDto(today));
    }

    public async Task<InvoiceDetailDto> GetAsync(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var invoice = await LoadVisibleAsync(account.Id, invoiceNumber, ct);

        var serviceReferences = (await _services.ListByAccountAsync(account.Id, ct))
            .ToDictionary(s => s.Id, s => s.ServiceReference);
        var payments = await _payments.ListByInvoiceAsync(invoice.Id, ct);

        return new InvoiceDetailDto(
            invoice.ToSummaryDto(_clock.Today),
            invoice.Lines.Select(l => l.ToDto(serviceReferences)).ToList(),
            invoice.Subtotal.ToDto(),
            invoice.TaxTotal.ToDto(),
            invoice.TaxRateBasisPoints,
            invoice.AmountPaid.ToDto(),
            invoice.CreditCarriedForward.ToDto(),
            invoice.VoidReason,
            payments.OrderByDescending(p => p.CreatedAt).Select(p => p.ToDto(invoice.InvoiceNumber)).ToList());
    }

    /// <summary>The rendered PDF held by the finance system. Only issued invoices have one.</summary>
    public async Task<InvoiceDocument> GetPdfAsync(string accountNumber, string invoiceNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var invoice = await LoadVisibleAsync(account.Id, invoiceNumber, ct);
        if (invoice.Status == InvoiceStatus.Draft)
        {
            throw new ConflictException("invoice.not_issued", "A PDF is only available once the invoice has been issued.");
        }

        return await _billingSystem.GetInvoicePdfAsync(invoice.InvoiceNumber, ct)
            ?? throw new NotFoundException("InvoiceDocument", invoice.InvoiceNumber);
    }

    public async Task<AccountBalanceDto> GetBalanceAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        return BuildBalance(payable, account.Currency);
    }

    internal static AccountBalanceDto BuildBalance(IReadOnlyCollection<Invoice> payable, string currency)
    {
        var overdue = payable.Where(i => i.Status == InvoiceStatus.Overdue).SumBalance(currency);
        var next = payable
            .Where(i => i.Status != InvoiceStatus.Overdue && i.DueOn is not null && i.BalanceDue.IsPositive)
            .OrderBy(i => i.DueOn)
            .FirstOrDefault();

        return new AccountBalanceDto(
            payable.SumBalance(currency).ToDto(),
            overdue.ToDto(),
            payable.Count,
            next?.DueOn,
            next?.InvoiceNumber);
    }

    private async Task<Invoice> LoadVisibleAsync(Guid accountId, string invoiceNumber, CancellationToken ct)
    {
        var invoice = await _invoices.GetByNumberAsync(accountId, invoiceNumber.Trim().ToUpperInvariant(), ct);
        if (invoice is null || (invoice.Status == InvoiceStatus.Draft && !_currentUser.IsSupportAgent))
        {
            throw new NotFoundException("Invoice", invoiceNumber);
        }

        return invoice;
    }
}

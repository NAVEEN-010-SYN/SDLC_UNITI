using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Invoices;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public AccountBalanceDto? Balance { get; private set; }

    public PagedResult<InvoiceSummaryDto>? Invoices { get; private set; }

    public PagedResult<PaymentDto>? Payments { get; private set; }

    public async Task OnGetAsync(int? page, CancellationToken ct)
    {
        var paging = PageOf(page);
        Balance = await Api.GetAsync<AccountBalanceDto>(AccountPath("balance"), ct);
        Invoices = await Api.GetAsync<PagedResult<InvoiceSummaryDto>>(AccountPath($"invoices?page={paging.Page}&pageSize={paging.PageSize}"), ct);
        Payments = await Api.GetAsync<PagedResult<PaymentDto>>(AccountPath("payments?page=1&pageSize=5"), ct);
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    public InvoiceDetailDto? Invoice { get; private set; }

    public async Task OnGetAsync(string invoiceNumber, CancellationToken ct) =>
        Invoice = await Api.GetAsync<InvoiceDetailDto>(AccountPath($"invoices/{Uri.EscapeDataString(invoiceNumber)}"), ct);

    public async Task<IActionResult> OnGetPdfAsync(string invoiceNumber, CancellationToken ct)
    {
        var (content, contentType, fileName) = await Api.DownloadAsync(AccountPath($"invoices/{Uri.EscapeDataString(invoiceNumber)}/pdf"), ct);
        return File(content, contentType, fileName);
    }
}

/// <summary>
/// Pays an invoice with a saved method. The idempotency key is minted when the form is rendered and
/// posted back, so a double-click or a retried submit can never charge twice.
/// </summary>
public sealed class PayModel : AccountPageModel
{
    public PayModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string InvoiceNumber { get; set; } = string.Empty;

    [BindProperty]
    public PayInput Input { get; set; } = new();

    public InvoiceDetailDto? Invoice { get; private set; }

    public IReadOnlyList<PaymentMethodDto> Methods { get; private set; } = Array.Empty<PaymentMethodDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        Input = new PayInput
        {
            PaymentMethodId = Methods.FirstOrDefault(m => m.IsDefault && !m.IsExpired)?.Id ?? Guid.Empty,
            Amount = Invoice!.Summary.BalanceDue.AmountMinor / 100m,
            IdempotencyKey = Guid.NewGuid().ToString("N"),
        };
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        await LoadAsync(ct);
        var amountMinor = decimal.Round(Input.Amount * 100m);
        if (amountMinor != Input.Amount * 100m)
        {
            ModelState.AddModelError("Input.Amount", "Enter an amount in pounds and pence.");
        }

        if (!ModelState.IsValid)
        {
            return Page();
        }

        try
        {
            await Api.SendAsync<PaymentDto>(
                HttpMethod.Post,
                AccountPath($"invoices/{Uri.EscapeDataString(InvoiceNumber)}/payments"),
                new PayInvoiceRequest(Input.PaymentMethodId, new MoneyDto((long)amountMinor, Invoice!.Summary.Total.Currency)),
                ct,
                Input.IdempotencyKey);
        }
        catch (ApiProblemException problem) when (problem.Code == "payment.declined")
        {
            // A declined attempt is final for this key; a fresh key lets the customer try another card.
            ModelState.AddModelError(string.Empty, problem.Message);
            Input.IdempotencyKey = Guid.NewGuid().ToString("N");
            ModelState.Remove("Input.IdempotencyKey");
            return Page();
        }

        TempData["Notice"] = $"Thank you — your payment for {InvoiceNumber} has been received.";
        return RedirectToPage("Details", new { invoiceNumber = InvoiceNumber });
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Invoice = await Api.GetAsync<InvoiceDetailDto>(AccountPath($"invoices/{Uri.EscapeDataString(InvoiceNumber)}"), ct);
        Methods = (await Api.GetAsync<IReadOnlyList<PaymentMethodDto>>(AccountPath("payment-methods"), ct)).Where(m => !m.IsExpired).ToList();
    }

    public sealed class PayInput
    {
        [Required(ErrorMessage = "Choose how to pay.")]
        public Guid PaymentMethodId { get; set; }

        [Range(0.01, 100_000, ErrorMessage = "Enter an amount greater than zero.")]
        public decimal Amount { get; set; }

        [Required]
        [StringLength(80)]
        public string IdempotencyKey { get; set; } = string.Empty;
    }
}

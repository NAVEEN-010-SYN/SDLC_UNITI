using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;
using Uconnect.Application.Usage;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Services;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<ServiceSummaryDto> Services { get; private set; } = Array.Empty<ServiceSummaryDto>();

    public IReadOnlyList<PlanChangeDto> PlanChanges { get; private set; } = Array.Empty<PlanChangeDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        Services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        PlanChanges = await Api.GetAsync<IReadOnlyList<PlanChangeDto>>(AccountPath("plan-changes"), ct);
    }

    public async Task<IActionResult> OnPostCancelChangeAsync(Guid planChangeId, CancellationToken ct)
    {
        await Api.SendAsync<PlanChangeDto>(HttpMethod.Post, AccountPath($"plan-changes/{planChangeId}/cancel"), null, ct);
        TempData["Notice"] = "Your plan change has been cancelled.";
        return RedirectToPage();
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    public ServiceDetailDto? Detail { get; private set; }

    public UsageSummaryDto? Usage { get; private set; }

    public async Task OnGetAsync(Guid id, CancellationToken ct)
    {
        Detail = await Api.GetAsync<ServiceDetailDto>(AccountPath($"services/{id}"), ct);
        if (Detail.Service.ProductType == "Broadband" && Detail.Service.Status != "PendingActivation")
        {
            Usage = await Api.GetAsync<UsageSummaryDto>(AccountPath($"services/{id}/usage"), ct);
        }
    }
}

/// <summary>Two-step plan change: show the server-computed quote, then accept exactly that amount.</summary>
public sealed class ChangePlanModel : AccountPageModel
{
    public ChangePlanModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public Guid ServiceId { get; set; }

    [BindProperty(SupportsGet = true)]
    [Required]
    public string Plan { get; set; } = string.Empty;

    [BindProperty(SupportsGet = true)]
    public DateOnly? EffectiveOn { get; set; }

    [BindProperty]
    public long AcceptedNetAmountMinor { get; set; }

    [BindProperty]
    [Range(typeof(bool), "true", "true", ErrorMessage = "Please accept the plan change terms.")]
    public bool AcceptTerms { get; set; }

    public PlanChangeQuoteDto? Quote { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) => await LoadQuoteAsync(ct);

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await LoadQuoteAsync(ct);
            return Page();
        }

        try
        {
            await Api.SendAsync<PlanChangeDto>(
                HttpMethod.Post,
                AccountPath("plan-changes"),
                new RequestPlanChangeRequest(ServiceId, Plan, EffectiveOn, AcceptedNetAmountMinor, AcceptTerms),
                ct);
        }
        catch (ApiProblemException problem) when (problem.Code == "plan_change.quote_changed")
        {
            ModelState.AddModelError(string.Empty, problem.Message);
            await LoadQuoteAsync(ct);
            return Page();
        }

        TempData["Notice"] = "Your plan change has been requested. We'll e-mail you when it is complete.";
        return RedirectToPage("Index");
    }

    private async Task LoadQuoteAsync(CancellationToken ct) =>
        Quote = await Api.SendAsync<PlanChangeQuoteDto>(
            HttpMethod.Post, AccountPath("plan-changes/quote"), new PlanChangeQuoteRequest(ServiceId, Plan, EffectiveOn), ct);
}

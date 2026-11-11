using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages;

/// <summary>
/// Base for every portal page that works on "the current account". Resolves the account from the
/// switcher cookie (falling back to the user's first account), exposes it to the layout, and turns API
/// problems into page-level validation messages instead of error pages.
/// </summary>
public abstract class AccountPageModel : PageModel
{
    public const string AccountCookie = "uconnect.account";

    protected AccountPageModel(UconnectApiClient api) => Api = api;

    protected UconnectApiClient Api { get; }

    public string AccountNumber { get; private set; } = string.Empty;

    public IReadOnlyList<AccountSummaryDto> Accounts { get; private set; } = Array.Empty<AccountSummaryDto>();

    public AccountSummaryDto? CurrentAccount => Accounts.FirstOrDefault(a => a.AccountNumber == AccountNumber);

    /// <summary>True when the signed-in role may pay, change plans and manage payment methods.</summary>
    public bool CanManage => CurrentAccount?.Role is "CONSUMER" or "BUSINESS_ADMIN";

    protected string AccountPath(string path = "") => UconnectApiClient.Account(AccountNumber, path);

    public override async Task OnPageHandlerExecutionAsync(PageHandlerExecutingContext context, PageHandlerExecutionDelegate next)
    {
        Accounts = await Api.GetAsync<IReadOnlyList<AccountSummaryDto>>("me/accounts", HttpContext.RequestAborted);
        if (Accounts.Count == 0)
        {
            context.Result = RedirectToPage("/NoAccount");
            return;
        }

        var selected = Request.Cookies[AccountCookie];
        AccountNumber = Accounts.Any(a => a.AccountNumber == selected) ? selected! : Accounts[0].AccountNumber;
        ViewData["Accounts"] = Accounts;
        ViewData["AccountNumber"] = AccountNumber;

        var executed = await next();
        if (executed.Exception is ApiProblemException problem && !executed.ExceptionHandled)
        {
            executed.ExceptionHandled = true;
            if (problem.Status == HttpStatusCode.NotFound)
            {
                executed.Result = NotFound();
                return;
            }

            AddProblem(problem);
            executed.Result = Page();
        }
    }

    /// <summary>Copies API field errors (camelCase paths) onto the page's model state.</summary>
    protected void AddProblem(ApiProblemException problem, string prefix = "Input")
    {
        if (problem.Errors.Count == 0)
        {
            ModelState.AddModelError(string.Empty, problem.Message);
            return;
        }

        foreach (var (field, messages) in problem.Errors)
        {
            var property = field.Length == 0 ? string.Empty : $"{char.ToUpperInvariant(field[0])}{field[1..]}";
            var key = prefix.Length == 0 || property.Length == 0 ? property : $"{prefix}.{property}";
            foreach (var message in messages)
            {
                ModelState.AddModelError(key, message);
            }
        }
    }

    protected static PageRequest PageOf(int? page) => PageRequest.Normalise(page, 10);
}

/// <summary>Formatting helpers shared by the views.</summary>
public static class Display
{
    private static readonly CultureInfo UkCulture = CultureInfo.GetCultureInfo("en-GB");

    public static string Money(MoneyDto? money)
    {
        if (money is null)
        {
            return "-";
        }

        var symbol = money.Currency switch { "GBP" => "£", "EUR" => "€", "USD" => "$", _ => money.Currency + " " };
        var major = Math.Abs(money.AmountMinor) / 100m;
        return (money.AmountMinor < 0 ? "-" : string.Empty) + symbol + major.ToString("#,##0.00", UkCulture);
    }

    public static string Date(DateOnly? date) => date?.ToString("d MMM yyyy", UkCulture) ?? "-";

    public static string When(DateTimeOffset? instant) =>
        instant is null ? "-" : instant.Value.ToUniversalTime().ToString("d MMM yyyy HH:mm 'UTC'", UkCulture);

    public static string Bytes(long bytes) => bytes switch
    {
        >= 1_000_000_000_000 => $"{bytes / 1_000_000_000_000d:0.00} TB",
        >= 1_000_000_000 => $"{bytes / 1_000_000_000d:0.0} GB",
        _ => $"{bytes / 1_000_000d:0} MB",
    };

    /// <summary>CSS modifier for a status badge: green for done, amber for in-flight, red for problems.</summary>
    public static string Tone(string status) => status switch
    {
        "Paid" or "Active" or "Completed" or "Resolved" or "Succeeded" or "Confirmed" or "Closed" => "ok",
        "Overdue" or "Failed" or "Suspended" or "Critical" or "Major" or "Missed" or "Cancelled" => "bad",
        _ => "info",
    };
}

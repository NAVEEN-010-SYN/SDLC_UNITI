using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Uconnect.Application.Dashboard;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public DashboardDto? Dashboard { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) =>
        Dashboard = await Api.GetAsync<DashboardDto>(AccountPath("dashboard"), ct);
}

/// <summary>Remembers the account chosen in the header switcher.</summary>
public sealed class SwitchAccountModel : AccountPageModel
{
    public SwitchAccountModel(UconnectApiClient api) : base(api)
    {
    }

    public IActionResult OnPost(string accountNumber)
    {
        if (Accounts.Any(a => a.AccountNumber == accountNumber))
        {
            Response.Cookies.Append(AccountCookie, accountNumber, new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Lax, IsEssential = true });
        }

        return RedirectToPage("/Index");
    }
}

public sealed class NoAccountModel : PageModel
{
}

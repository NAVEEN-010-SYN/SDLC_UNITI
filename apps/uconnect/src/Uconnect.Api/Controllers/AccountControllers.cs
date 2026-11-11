using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Api.Security;
using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Application.Dashboard;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Services;

namespace Uconnect.Api.Controllers;

/// <summary>Base for routes scoped to one account. Per-account rights are enforced in the application layer.</summary>
[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/v1/accounts/{accountNumber}")]
[Produces("application/json")]
public abstract class AccountScopedController : ControllerBase
{
    protected static PageRequest Page(int? page, int? pageSize) => PageRequest.Normalise(page, pageSize);
}

[ApiController]
[Authorize(Policy = Policies.Customer)]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
    private readonly ProfileService _profiles;

    public MeController(ProfileService profiles) => _profiles = profiles;

    /// <summary>Accounts the signed-in user can access.</summary>
    [HttpGet("accounts")]
    public Task<IReadOnlyList<AccountSummaryDto>> MyAccounts(CancellationToken ct) => _profiles.ListMyAccountsAsync(ct);
}

public sealed class AccountsController : AccountScopedController
{
    private readonly ProfileService _profiles;
    private readonly AccountUserService _users;
    private readonly DashboardService _dashboard;

    public AccountsController(ProfileService profiles, AccountUserService users, DashboardService dashboard)
    {
        _profiles = profiles;
        _users = users;
        _dashboard = dashboard;
    }

    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard(string accountNumber, CancellationToken ct) => _dashboard.GetAsync(accountNumber, ct);

    [HttpGet("profile")]
    public Task<AccountProfileDto> GetProfile(string accountNumber, CancellationToken ct) => _profiles.GetAsync(accountNumber, ct);

    [HttpPut("profile")]
    public Task<AccountProfileDto> UpdateProfile(string accountNumber, UpdateProfileRequest request, CancellationToken ct) =>
        _profiles.UpdateAsync(accountNumber, request, ct);

    [HttpPut("preferences")]
    public Task<AccountProfileDto> UpdatePreferences(string accountNumber, UpdatePreferencesRequest request, CancellationToken ct) =>
        _profiles.UpdatePreferencesAsync(accountNumber, request, ct);

    [HttpPut("billing-day")]
    public Task<AccountProfileDto> ChangeBillingDay(string accountNumber, ChangeBillingDayRequest request, CancellationToken ct) =>
        _profiles.ChangeBillingDayAsync(accountNumber, request, ct);

    [HttpGet("users")]
    public Task<IReadOnlyList<AccountUserDto>> ListUsers(string accountNumber, CancellationToken ct) => _users.ListAsync(accountNumber, ct);

    [HttpPost("users")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<AccountUserDto>> InviteUser(string accountNumber, InviteUserRequest request, CancellationToken ct)
    {
        var user = await _users.InviteAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/users/{user.Id}", user);
    }

    [HttpPut("users/{userId:guid}/role")]
    public Task<AccountUserDto> ChangeRole(string accountNumber, Guid userId, ChangeUserRoleRequest request, CancellationToken ct) =>
        _users.ChangeRoleAsync(accountNumber, userId, request, ct);

    [HttpDelete("users/{userId:guid}")]
    public async Task<IActionResult> RemoveUser(string accountNumber, Guid userId, CancellationToken ct)
    {
        await _users.RemoveAsync(accountNumber, userId, ct);
        return NoContent();
    }
}

public sealed class ServicesController : AccountScopedController
{
    private readonly ServiceInventoryService _inventory;
    private readonly PlanChangeService _planChanges;

    public ServicesController(ServiceInventoryService inventory, PlanChangeService planChanges)
    {
        _inventory = inventory;
        _planChanges = planChanges;
    }

    [HttpGet("services")]
    public Task<IReadOnlyList<ServiceSummaryDto>> List(string accountNumber, [FromQuery] bool includeCancelled, CancellationToken ct) =>
        _inventory.ListAsync(accountNumber, includeCancelled, ct);

    [HttpGet("services/{serviceId:guid}")]
    public Task<ServiceDetailDto> Get(string accountNumber, Guid serviceId, CancellationToken ct) =>
        _inventory.GetAsync(accountNumber, serviceId, ct);

    [HttpPost("plan-changes/quote")]
    public Task<PlanChangeQuoteDto> Quote(string accountNumber, PlanChangeQuoteRequest request, CancellationToken ct) =>
        _planChanges.QuoteAsync(accountNumber, request, ct);

    [HttpGet("plan-changes")]
    public Task<IReadOnlyList<PlanChangeDto>> ListPlanChanges(string accountNumber, CancellationToken ct) =>
        _planChanges.ListAsync(accountNumber, ct);

    [HttpPost("plan-changes")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    public async Task<ActionResult<PlanChangeDto>> RequestPlanChange(string accountNumber, RequestPlanChangeRequest request, CancellationToken ct)
    {
        var change = await _planChanges.RequestAsync(accountNumber, request, ct);
        return Created($"/api/v1/accounts/{accountNumber}/plan-changes/{change.Id}", change);
    }

    [HttpPost("plan-changes/{planChangeId:guid}/cancel")]
    public Task<PlanChangeDto> CancelPlanChange(string accountNumber, Guid planChangeId, CancellationToken ct) =>
        _planChanges.CancelAsync(accountNumber, planChangeId, ct);
}

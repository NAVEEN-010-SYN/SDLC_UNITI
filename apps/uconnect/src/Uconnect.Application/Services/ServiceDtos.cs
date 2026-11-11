using Uconnect.Application.Accounts;
using Uconnect.Application.Common;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Services;

namespace Uconnect.Application.Services;

public sealed record PlanDto(
    string Code,
    string Name,
    string ProductType,
    int Tier,
    int DownloadMbps,
    int UploadMbps,
    MoneyDto MonthlyPrice,
    MoneyDto SetupFee,
    int MinimumTermMonths,
    int? FairUseAllowanceGb);

public sealed record ServiceSummaryDto(
    Guid Id,
    string ServiceReference,
    string ProductType,
    string Status,
    PlanDto Plan,
    MoneyDto MonthlyPrice,
    AddressDto ServiceAddress,
    DateOnly? ActivatedOn,
    DateOnly? ContractEndsOn,
    bool HasPendingPlanChange);

public sealed record ServiceDetailDto(
    ServiceSummaryDto Service,
    int RemainingContractMonths,
    IReadOnlyList<PlanOptionDto> PlanOptions,
    int OpenTicketCount,
    bool AffectedByOutage);

/// <summary>A plan the service could move to, with how the move would be classified.</summary>
public sealed record PlanOptionDto(PlanDto Plan, string ChangeType, MoneyDto MonthlyDifference);

internal static class ServiceMapping
{
    public static PlanDto ToDto(this Plan plan) => new(
        plan.Code,
        plan.Name,
        plan.ProductType.ToString(),
        plan.Tier,
        plan.DownloadMbps,
        plan.UploadMbps,
        plan.MonthlyPrice.ToDto(),
        plan.SetupFee.ToDto(),
        plan.MinimumTermMonths,
        plan.FairUseAllowanceGb);

    public static ServiceSummaryDto ToSummaryDto(this Service service, Plan plan) => new(
        service.Id,
        service.ServiceReference,
        service.ProductType.ToString(),
        service.Status.ToString(),
        plan.ToDto(),
        service.MonthlyPrice.ToDto(),
        service.ServiceAddress.ToDto(),
        service.ActivatedOn,
        service.ContractEndsOn,
        service.PendingPlanChangeId is not null);
}

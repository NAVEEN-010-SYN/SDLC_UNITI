using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;
using Uconnect.Domain.Usage;

namespace Uconnect.Application.Usage;

public sealed record DailyUsageDto(DateOnly Date, long DownloadBytes, long UploadBytes);

public sealed record UsageSummaryDto(
    Guid ServiceId,
    string ServiceReference,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    long DownloadBytes,
    long UploadBytes,
    long TotalBytes,
    int? AllowanceGb,
    string FairUseState,
    int PercentOfAllowance,
    long? ProjectedTotalBytes,
    MoneyDto? EstimatedOverageCharge,
    IReadOnlyList<DailyUsageDto> Daily);

public sealed record UsageRecordInput(Guid ServiceId, DateOnly Date, long DownloadBytes, long UploadBytes);

/// <summary>A batch from the network mediation feed. Re-sent days replace earlier figures.</summary>
public sealed record IngestUsageRequest(IReadOnlyList<UsageRecordInput> Records);

public sealed record UsageIngestResult(int Inserted, int Corrected, int Rejected, IReadOnlyList<string> Errors);

public sealed class IngestUsageRequestValidator : AbstractValidator<IngestUsageRequest>
{
    public const int MaxBatchSize = 5000;

    public IngestUsageRequestValidator()
    {
        RuleFor(r => r.Records).NotEmpty()
            .Must(r => r is null || r.Count <= MaxBatchSize).WithMessage($"At most {MaxBatchSize} records per batch.")
            .Must(r => r is null || r.Select(x => (x.ServiceId, x.Date)).Distinct().Count() == r.Count)
            .WithMessage("A batch may contain each service and day only once.");
        RuleForEach(r => r.Records).ChildRules(record =>
        {
            record.RuleFor(x => x.ServiceId).NotEmpty();
            record.RuleFor(x => x.DownloadBytes).GreaterThanOrEqualTo(0);
            record.RuleFor(x => x.UploadBytes).GreaterThanOrEqualTo(0);
        });
    }
}

/// <summary>Broadband usage against the plan's fair-use allowance, and ingestion of the daily mediation feed.</summary>
public sealed class UsageService
{
    /// <summary>How far back customers can look at usage history.</summary>
    public const int HistoryMonths = 12;

    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly IUsageRepository _usage;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<IngestUsageRequest> _ingestValidator;
    private readonly ILogger<UsageService> _logger;

    public UsageService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IServiceRepository services,
        IPlanRepository plans,
        IUsageRepository usage,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<IngestUsageRequest> ingestValidator,
        ILogger<UsageService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _services = services;
        _plans = plans;
        _usage = usage;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _ingestValidator = ingestValidator;
        _logger = logger;
    }

    /// <summary>Usage for the billing cycle containing <paramref name="periodDate"/> (default: the current cycle).</summary>
    public async Task<UsageSummaryDto> GetSummaryAsync(string accountNumber, Guid serviceId, DateOnly? periodDate, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var service = await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
        var today = _clock.Today;
        var date = periodDate ?? today;
        if (date > today || date < today.AddMonths(-HistoryMonths))
        {
            throw new RequestValidationException("period", $"Usage is available for the last {HistoryMonths} months.");
        }

        var period = BillingPeriod.Containing(date, account.BillingDay);
        var plan = await _plans.GetByIdAsync(service.PlanId, ct) ?? throw new NotFoundException("Plan", service.PlanId);
        var records = await _usage.ListAsync(service.Id, period.Start, period.End, ct);
        var summary = FairUsePolicy.Summarise(service.Id, period, plan, records);
        var isCurrent = period.Contains(today);

        return new UsageSummaryDto(
            service.Id,
            service.ServiceReference,
            period.Start,
            period.End,
            summary.DownloadBytes,
            summary.UploadBytes,
            summary.TotalBytes,
            summary.AllowanceGb,
            summary.State.ToString(),
            summary.PercentOfAllowance,
            isCurrent ? FairUsePolicy.ProjectEndOfPeriodBytes(summary, today) : null,
            summary.Charge?.Amount.ToDto(),
            DailySeries(period, isCurrent ? today : period.LastDay, records));
    }

    public async Task<UsageIngestResult> IngestAsync(IngestUsageRequest request, CancellationToken ct)
    {
        await _ingestValidator.EnsureValidAsync(request, ct);
        var now = _clock.UtcNow;
        var today = _clock.Today;
        var services = new Dictionary<Guid, Service?>();
        var errors = new List<string>();
        int inserted = 0, corrected = 0;

        foreach (var input in request.Records)
        {
            if (input.Date > today)
            {
                errors.Add($"{input.ServiceId}/{input.Date:yyyy-MM-dd}: usage date is in the future.");
                continue;
            }

            var service = await GetCachedServiceAsync(services, input.ServiceId, ct);
            if (service == null || service.ActivatedOn == null || input.Date < service.ActivatedOn.Value)
            {
                errors.Add($"{input.ServiceId}/{input.Date:yyyy-MM-dd}: no active service on that date.");
                continue;
            }

            var existing = await _usage.FindAsync(service.Id, input.Date, ct);
            if (existing is null)
            {
                _usage.Add(new UsageRecord(Guid.NewGuid(), service.Id, input.Date, input.DownloadBytes, input.UploadBytes, now));
                inserted++;
            }
            else
            {
                existing.Correct(input.DownloadBytes, input.UploadBytes, now);
                corrected++;
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Usage batch ingested: {Inserted} new, {Corrected} corrected, {Rejected} rejected", inserted, corrected, errors.Count);
        return new UsageIngestResult(inserted, corrected, errors.Count, errors.Take(100).ToList());
    }

    private async Task<Service?> GetCachedServiceAsync(Dictionary<Guid, Service?> cache, Guid serviceId, CancellationToken ct)
    {
        if (cache.TryGetValue(serviceId, out var cached))
        {
            return cached;
        }

        var service = await _services.GetByIdAsync(serviceId, ct);
        cache[serviceId] = service;
        return service;
    }

    private static IReadOnlyList<DailyUsageDto> DailySeries(BillingPeriod period, DateOnly lastDay, IReadOnlyList<UsageRecord> records)
    {
        var byDate = records.ToDictionary(r => r.UsageDate);
        var series = new List<DailyUsageDto>();
        for (var day = period.Start; day <= lastDay && day < period.End; day = day.AddDays(1))
        {
            series.Add(byDate.TryGetValue(day, out var r)
                ? new DailyUsageDto(day, r.DownloadBytes, r.UploadBytes)
                : new DailyUsageDto(day, 0, 0));
        }

        return series;
    }
}

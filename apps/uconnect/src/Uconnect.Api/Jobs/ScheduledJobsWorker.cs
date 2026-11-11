using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Application.PlanChanges;
using Uconnect.Application.Tickets;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Jobs;

/// <summary>Scheduler settings (section <c>Uconnect:Jobs</c>). Disable on all but one instance.</summary>
public sealed class JobOptions
{
    public const string SectionName = "Uconnect:Jobs";

    public bool Enabled { get; set; } = true;

    public int PlanChangeIntervalMinutes { get; set; } = 5;

    public int DailyJobsIntervalMinutes { get; set; } = 60;
}

/// <summary>
/// Runs the recurring business jobs. Plan-change provisioning polls frequently; billing, collections,
/// autopay and ticket housekeeping run hourly and are idempotent, so running them repeatedly within a
/// day only does new work. Each run gets its own DI scope (and therefore its own unit of work).
/// </summary>
public sealed class ScheduledJobsWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly JobOptions _options;
    private readonly ILogger<ScheduledJobsWorker> _logger;

    public ScheduledJobsWorker(IServiceScopeFactory scopes, Microsoft.Extensions.Options.IOptions<JobOptions> options, ILogger<ScheduledJobsWorker> logger)
    {
        _scopes = scopes;
        _options = options.Value;
        _logger = logger;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Scheduled jobs are disabled on this instance");
            return Task.CompletedTask;
        }

        return Task.WhenAll(
            LoopAsync("plan-changes", TimeSpan.FromMinutes(_options.PlanChangeIntervalMinutes), RunPlanChangesAsync, stoppingToken),
            LoopAsync("daily-billing", TimeSpan.FromMinutes(_options.DailyJobsIntervalMinutes), RunDailyAsync, stoppingToken));
    }

    private static async Task RunPlanChangesAsync(IServiceProvider services, CancellationToken ct) =>
        await services.GetRequiredService<PlanChangeProcessor>().RunAsync(ct);

    private static async Task RunDailyAsync(IServiceProvider services, CancellationToken ct)
    {
        var today = services.GetRequiredService<IClock>().Today;
        await services.GetRequiredService<BillingRunService>().RunAsync(today, ct);
        await services.GetRequiredService<BillingRunService>().ProcessCollectionsAsync(ct);
        await services.GetRequiredService<AutopayProcessor>().RunAsync(ct);
        await services.GetRequiredService<TicketHousekeeping>().AutoCloseAsync(ct);
    }

    private async Task LoopAsync(string name, TimeSpan interval, Func<IServiceProvider, CancellationToken, Task> job, CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            CorrelationContext.CorrelationId = $"job-{name}-{Guid.NewGuid():N}";
            using var scope = _scopes.CreateScope();
            using var logScope = _logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = CorrelationContext.CorrelationId, ["Job"] = name });
            try
            {
                await job(scope.ServiceProvider, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Scheduled job {Job} failed", name);
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

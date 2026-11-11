using IConnect.Wholesale.Application.Sla;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Api.Hosting;

public sealed class SlaMonitorOptions
{
    public const string Section = "SlaMonitor";

    /// <summary>Enable on exactly one worker instance; sweeps are idempotent but not distributed-locked.</summary>
    public bool Enabled { get; set; }

    public int IntervalSeconds { get; set; } = 300;
}

/// <summary>Runs <see cref="SlaBreachMonitor.SweepAsync"/> on a fixed cadence, each sweep in its own DI scope.</summary>
public sealed class SlaMonitorHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IOptionsMonitor<SlaMonitorOptions> _options;
    private readonly ILogger<SlaMonitorHostedService> _logger;

    public SlaMonitorHostedService(IServiceScopeFactory scopes, IOptionsMonitor<SlaMonitorOptions> options, ILogger<SlaMonitorHostedService> logger)
    {
        _scopes = scopes;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.CurrentValue.Enabled)
        {
            _logger.LogInformation("SLA monitor disabled on this instance");
            return;
        }

        var interval = TimeSpan.FromSeconds(Math.Clamp(_options.CurrentValue.IntervalSeconds, 30, 3_600));
        using var timer = new PeriodicTimer(interval);
        do
        {
            using var scope = _scopes.CreateScope();
            using var _ = _logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = $"sla-sweep-{Guid.NewGuid():N}" });
            try
            {
                var result = await scope.ServiceProvider.GetRequiredService<SlaBreachMonitor>().SweepAsync(stoppingToken);
                _logger.LogInformation(
                    "SLA sweep: {FaultsChecked} faults ({FaultBreaches} new breaches), {OrdersChecked} orders ({OrderBreaches} new breaches), {AutoClosed} faults auto-closed",
                    result.FaultsChecked, result.FaultBreaches, result.OrdersChecked, result.OrderBreaches, result.FaultsAutoClosed);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "SLA sweep failed; retrying at the next interval");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

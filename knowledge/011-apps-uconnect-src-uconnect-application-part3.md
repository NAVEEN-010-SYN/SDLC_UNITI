# Uconnect account & service management: apps/uconnect/src/Uconnect.Application (part 3 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/uconnect/src/Uconnect.Application/Outages/OutageEventHandlers.cs` (190 lines)
- `apps/uconnect/src/Uconnect.Application/Outages/OutageService.cs` (144 lines)
- `apps/uconnect/src/Uconnect.Application/Payments/AutopayProcessor.cs` (120 lines)
- `apps/uconnect/src/Uconnect.Application/Payments/PaymentDtos.cs` (145 lines)
- `apps/uconnect/src/Uconnect.Application/Payments/PaymentExecutor.cs` (166 lines)
- `apps/uconnect/src/Uconnect.Application/Payments/PaymentMethodService.cs` (178 lines)
- `apps/uconnect/src/Uconnect.Application/Payments/PaymentService.cs` (184 lines)
- `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeDtos.cs` (101 lines)
- `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeProcessor.cs` (183 lines)
- `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeService.cs` (163 lines)
- `apps/uconnect/src/Uconnect.Application/Services/ServiceDtos.cs` (68 lines)
- `apps/uconnect/src/Uconnect.Application/Services/ServiceInventoryService.cs` (103 lines)
- `apps/uconnect/src/Uconnect.Application/Tickets/TicketDtos.cs` (131 lines)

## apps/uconnect/src/Uconnect.Application/Outages/OutageEventHandlers.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Outages/OutageEventHandlers.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Notifications;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;

namespace Uconnect.Application.Outages;

/// <summary>
/// Tells affected customers when an outage is declared (or widened to their area) and when it is
/// resolved, then raises automatic service credits under <see cref="OutageCompensationPolicy"/>.
/// Every notification and credit is recorded so a re-delivered event never duplicates either.
/// </summary>
public sealed class OutageEventHandlers : IDomainEventHandler<OutageDeclared>, IDomainEventHandler<OutageResolved>
{
    private readonly IOutageRepository _outages;
    private readonly IServiceRepository _services;
    private readonly IAccountRepository _accounts;
    private readonly IAdjustmentRepository _adjustments;
    private readonly CustomerNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly CompensationOptions _compensation;
    private readonly ILogger<OutageEventHandlers> _logger;

    public OutageEventHandlers(
        IOutageRepository outages,
        IServiceRepository services,
        IAccountRepository accounts,
        IAdjustmentRepository adjustments,
        CustomerNotifier notifier,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<CompensationOptions> compensation,
        ILogger<OutageEventHandlers> logger)
    {
        _outages = outages;
        _services = services;
        _accounts = accounts;
        _adjustments = adjustments;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _compensation = compensation.Value;
        _logger = logger;
    }

    public async Task HandleAsync(OutageDeclared domainEvent, CancellationToken cancellationToken)
    {
        var outage = await _outages.GetByIdAsync(domainEvent.OutageId, cancellationToken);
        if (outage is null || outage.IsResolved)
        {
            return;
        }

        var message = new CustomerMessage(
            $"Service disruption in your area ({outage.Reference})",
            new[]
            {
                $"We are aware of a problem affecting services in your area: {outage.Title}.",
                outage.EstimatedResolutionAt is { } eta
                    ? $"We expect service to be restored by {eta:dd MMM yyyy HH:mm} UTC."
                    : "Our engineers are investigating and we will update you as soon as we know more.",
                "There is no need to raise a fault ticket for this issue.",
            },
            "outages",
            $"Uniti: known service issue in your area ({outage.Reference}). Updates at our status page; no need to contact us.");

        var affected = await AffectedAccountsAsync(domainEvent.OutwardCodes, cancellationToken);
        await NotifyAsync(outage, affected.Keys, OutageNotificationKind.Declared, message, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task HandleAsync(OutageResolved domainEvent, CancellationToken cancellationToken)
    {
        var outage = await _outages.GetByIdAsync(domainEvent.OutageId, cancellationToken);
        if (outage is null)
        {
            return;
        }

        var affected = await AffectedAccountsAsync(outage.AffectedOutwardCodes, cancellationToken);
        var duration = outage.Duration(_clock.UtcNow);
        var credits = _compensation.AutomaticOutageCredits
            ? await RaiseCreditsAsync(outage, affected, duration, cancellationToken)
            : new Dictionary<Guid, Money>();

        foreach (var accountId in affected.Keys)
        {
            var paragraphs = new List<string>
            {
                $"The problem affecting your area ({outage.Title}) has been fixed and service has been restored.",
                "If your connection is still not working, please restart your router and raise a fault ticket if the problem continues.",
            };
            if (credits.TryGetValue(accountId, out var credit))
            {
                paragraphs.Add($"We're sorry for the disruption. A credit of {credit} will appear on your next invoice.");
            }

            var message = new CustomerMessage(
                $"Service restored ({outage.Reference})",
                paragraphs,
                "outages",
                $"Uniti: the service issue in your area ({outage.Reference}) is fixed. Restart your router if you still have problems.");
            await NotifyAsync(outage, new[] { accountId }, OutageNotificationKind.Resolved, message, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "Outage {Reference} resolved after {Duration}: {Accounts} accounts notified, {Credits} credited",
            outage.Reference, duration, affected.Count, credits.Count);
    }

    private async Task<Dictionary<Guid, Money>> RaiseCreditsAsync(
        Outage outage, IReadOnlyDictionary<Guid, List<Service>> affected, TimeSpan duration, CancellationToken ct)
    {
        var credited = new Dictionary<Guid, Money>();
        foreach (var (accountId, services) in affected)
        {
            var account = await _accounts.GetByIdAsync(accountId, ct);
            if (account is null)
            {
                continue;
            }

            foreach (var service in services)
            {
                var credit = OutageCompensationPolicy.CalculateCredit(account.Type, outage.Severity, service.MonthlyPrice, duration);
                if (!credit.IsPositive || await _adjustments.ExistsForSourceAsync(accountId, service.Id, outage.Reference, ct))
                {
                    continue;
                }

                _adjustments.Add(new AccountAdjustment(
                    Guid.NewGuid(),
                    accountId,
                    service.Id,
                    AdjustmentReason.OutageCompensation,
                    $"Service credit for outage {outage.Reference} ({service.ServiceReference})",
                    credit.Negate(),
                    SystemActors.OutageCompensation,
                    _clock.UtcNow,
                    sourceReference: outage.Reference));
                credited[accountId] = credited.TryGetValue(accountId, out var total) ? total + credit : credit;
            }
        }

        return credited;
    }

    private async Task<IReadOnlyDictionary<Guid, List<Service>>> AffectedAccountsAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct)
    {
        var services = await _services.ListLiveInOutwardCodesAsync(outwardCodes, ct);
        return services.GroupBy(s => s.AccountId).ToDictionary(g => g.Key, g => g.ToList());
    }

    private async Task NotifyAsync(Outage outage, IEnumerable<Guid> accountIds, OutageNotificationKind kind, CustomerMessage message, CancellationToken ct)
    {
        foreach (var accountId in accountIds)
        {
            var account = await _accounts.GetByIdAsync(accountId, ct);
            if (account is null || account.Status == AccountStatus.Closed)
            {
                continue;
            }

            await SendOnceAsync(outage, account, kind, NotificationChannel.Email, () => _notifier.EmailAsync(account, message, ct), ct);
            await SendOnceAsync(outage, account, kind, NotificationChannel.Sms, () => _notifier.SmsAsync(account, message, ct), ct);
        }
    }

    private async Task SendOnceAsync(Outage outage, Account account, OutageNotificationKind kind, NotificationChannel channel, Func<Task<bool>> send, CancellationToken ct)
    {
        if (await _outages.HasNotificationAsync(outage.Id, account.Id, kind, channel, ct))
        {
            return;
        }

        if (await send())
        {
            _outages.AddNotification(new OutageNotification(Guid.NewGuid(), outage.Id, account.Id, kind, channel, _clock.UtcNow));
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Outages/OutageService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Outages/OutageService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;

namespace Uconnect.Application.Outages;

/// <summary>
/// Network outage status. Any signed-in user can see the outage board and an account's affected
/// services; only support agents (acting for the network operations centre) declare and update incidents.
/// </summary>
public sealed class OutageService
{
    /// <summary>Resolved outages stay on an account's view for this long so customers see the all-clear.</summary>
    public static readonly TimeSpan RecentlyResolvedWindow = TimeSpan.FromHours(48);

    private readonly AccountAccessGuard _guard;
    private readonly IOutageRepository _outages;
    private readonly IServiceRepository _services;
    private readonly IReferenceGenerator _references;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<DeclareOutageRequest> _declareValidator;
    private readonly IValidator<PostOutageUpdateRequest> _updateValidator;
    private readonly IValidator<AddOutageAreasRequest> _areasValidator;
    private readonly ILogger<OutageService> _logger;

    public OutageService(
        AccountAccessGuard guard,
        IOutageRepository outages,
        IServiceRepository services,
        IReferenceGenerator references,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<DeclareOutageRequest> declareValidator,
        IValidator<PostOutageUpdateRequest> updateValidator,
        IValidator<AddOutageAreasRequest> areasValidator,
        ILogger<OutageService> logger)
    {
        _guard = guard;
        _outages = outages;
        _services = services;
        _references = references;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _declareValidator = declareValidator;
        _updateValidator = updateValidator;
        _areasValidator = areasValidator;
        _logger = logger;
    }

    public async Task<PagedResult<OutageDto>> ListAsync(bool includeResolved, PageRequest page, CancellationToken ct) =>
        (await _outages.ListAsync(includeResolved, page, ct)).Map(o => o.ToDto());

    public async Task<OutageDto> GetAsync(string reference, CancellationToken ct) =>
        (await LoadAsync(reference, ct)).ToDto();

    public async Task<IReadOnlyList<AccountOutageDto>> ListForAccountAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var services = (await _services.ListByAccountAsync(account.Id, ct)).Where(s => s.IsLive).ToList();
        if (services.Count == 0)
        {
            return Array.Empty<AccountOutageDto>();
        }

        var outages = await _outages.ListCurrentAsync(_clock.UtcNow - RecentlyResolvedWindow, ct);
        return outages
            .Select(o => (Outage: o, Affected: services.Where(s => o.Affects(s.ServiceAddress)).Select(s => s.ServiceReference).ToList()))
            .Where(x => x.Affected.Count > 0)
            .OrderBy(x => x.Outage.IsResolved)
            .ThenByDescending(x => x.Outage.Severity)
            .ThenByDescending(x => x.Outage.StartedAt)
            .Select(x => new AccountOutageDto(x.Outage.ToDto(), x.Affected))
            .ToList();
    }

    public async Task<OutageDto> DeclareAsync(DeclareOutageRequest request, CancellationToken ct)
    {
        EnsureAgent();
        await _declareValidator.EnsureValidAsync(request, ct);
        var outage = new Outage(
            Guid.NewGuid(),
            await _references.NextAsync(ReferenceKind.Outage, ct),
            request.Title,
            request.Description,
            EnumParsing.Parse<OutageSeverity>(request.Severity, "severity"),
            request.AffectedAreas,
            request.StartedAt.ToUniversalTime(),
            request.EstimatedResolutionAt?.ToUniversalTime(),
            _clock.UtcNow);

        _outages.Add(outage);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogWarning(
            "Outage {Reference} ({Severity}) declared for {Areas} by {UserId}",
            outage.Reference, outage.Severity, string.Join(",", outage.AffectedOutwardCodes), _currentUser.UserId);
        return outage.ToDto();
    }

    public async Task<OutageDto> PostUpdateAsync(string reference, PostOutageUpdateRequest request, CancellationToken ct)
    {
        EnsureAgent();
        await _updateValidator.EnsureValidAsync(request, ct);
        var outage = await LoadAsync(reference, ct);
        outage.PostUpdate(
            EnumParsing.Parse<OutageStatus>(request.Status, "status"),
            request.Message,
            request.EstimatedResolutionAt?.ToUniversalTime(),
            _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Outage {Reference} now {Status}", outage.Reference, outage.Status);
        return outage.ToDto();
    }

    public async Task<OutageDto> AddAreasAsync(string reference, AddOutageAreasRequest request, CancellationToken ct)
    {
        EnsureAgent();
        await _areasValidator.EnsureValidAsync(request, ct);
        var outage = await LoadAsync(reference, ct);
        var added = outage.AddAffectedAreas(request.AffectedAreas, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Outage {Reference} widened by {Added}", outage.Reference, string.Join(",", added));
        return outage.ToDto();
    }

    private void EnsureAgent()
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can manage outages.");
        }
    }

    private async Task<Outage> LoadAsync(string reference, CancellationToken ct) =>
        await _outages.GetByReferenceAsync(reference.Trim().ToUpperInvariant(), ct)
        ?? throw new NotFoundException("Outage", reference);
}
```

## apps/uconnect/src/Uconnect.Application/Payments/AutopayProcessor.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Payments/AutopayProcessor.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// Daily autopay collection. For each enabled account, every payable invoice is evaluated against the
/// autopay rules and charged at most once per day (the idempotency key embeds the date), so a failed
/// collection is retried on the following days until autopay suspends itself after repeated failures.
/// </summary>
public sealed class AutopayProcessor
{
    private readonly IAutopayRepository _autopay;
    private readonly IAccountRepository _accounts;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IPaymentMethodRepository _methods;
    private readonly PaymentExecutor _executor;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<AutopayProcessor> _logger;

    public AutopayProcessor(
        IAutopayRepository autopay,
        IAccountRepository accounts,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IPaymentMethodRepository methods,
        PaymentExecutor executor,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<AutopayProcessor> logger)
    {
        _autopay = autopay;
        _accounts = accounts;
        _invoices = invoices;
        _payments = payments;
        _methods = methods;
        _executor = executor;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<AutopayRunSummary> RunAsync(CancellationToken ct)
    {
        var today = _clock.Today;
        int evaluated = 0, charged = 0, declined = 0, skipped = 0, errors = 0;

        foreach (var settings in await _autopay.ListEnabledAsync(ct))
        {
            try
            {
                var account = await _accounts.GetByIdAsync(settings.AccountId, ct);
                if (account is null || account.Status == AccountStatus.Closed)
                {
                    continue;
                }

                foreach (var invoice in await _invoices.ListPayableAsync(account.Id, ct))
                {
                    evaluated++;
                    var decision = settings.Evaluate(invoice, today);
                    var key = $"autopay-{invoice.Id:N}-{today:yyyyMMdd}";
                    var earlierAttempt = decision.ShouldCharge ? await _payments.FindByIdempotencyKeyAsync(account.Id, key, ct) : null;
                    if (!decision.ShouldCharge || earlierAttempt is { Status: not PaymentStatus.Pending })
                    {
                        skipped++;
                        continue;
                    }

                    var method = await _methods.GetByIdAsync(decision.PaymentMethodId!.Value, ct);
                    var succeeded = false;
                    if (method is not null && method.IsUsable(today))
                    {
                        // A payment left pending by a gateway outage earlier today is resumed rather than duplicated.
                        var payment = earlierAttempt is null
                            ? await _executor.ExecuteAsync(account, invoice, method, decision.Amount!, PaymentChannel.Autopay, key, ct)
                            : await _executor.ChargeAsync(account, invoice, method, earlierAttempt, ct);
                        succeeded = payment.Status == PaymentStatus.Succeeded;
                    }

                    if (succeeded)
                    {
                        charged++;
                        settings.RecordSuccess();
                    }
                    else
                    {
                        declined++;
                        if (settings.RecordFailure(_clock.UtcNow))
                        {
                            _logger.LogWarning("Autopay suspended for {AccountNumber} after {Failures} failed collections", account.Number, settings.ConsecutiveFailures);
                        }
                    }

                    await _unitOfWork.SaveChangesAsync(ct);
                    if (!settings.Enabled)
                    {
                        break;
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Autopay collection failed for account {AccountId}", settings.AccountId);
            }
        }

        _logger.LogInformation(
            "Autopay run: {Evaluated} invoices evaluated, {Charged} charged, {Declined} declined, {Skipped} skipped, {Errors} errors",
            evaluated, charged, declined, skipped, errors);
        return new AutopayRunSummary(evaluated, charged, declined, skipped, errors);
    }
}
```

## apps/uconnect/src/Uconnect.Application/Payments/PaymentDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Payments/PaymentDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

public sealed record PaymentDto(
    Guid Id,
    string? InvoiceNumber,
    MoneyDto Amount,
    MoneyDto RefundedAmount,
    string Status,
    string Channel,
    string? FailureCode,
    string? FailureMessage,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

/// <summary>Pays (part of) an invoice with a saved method. The amount must not exceed the balance due.</summary>
public sealed record PayInvoiceRequest(Guid PaymentMethodId, MoneyDto? Amount);

public sealed record RefundPaymentRequest(MoneyDto? Amount, string Reason);

public sealed record PaymentMethodDto(
    Guid Id,
    string Type,
    string Masked,
    string Label,
    string Last4,
    int? ExpiryMonth,
    int? ExpiryYear,
    bool IsDefault,
    bool IsExpired,
    bool ExpiresSoon,
    bool UsedByAutopay);

/// <summary>Registers a card or direct-debit mandate the browser has already tokenised with the gateway.</summary>
public sealed record AddPaymentMethodRequest(string PaymentToken, bool MakeDefault);

public sealed record AutopayDto(
    bool Enabled,
    Guid? PaymentMethodId,
    int DaysBeforeDue,
    MoneyDto? MaxAmount,
    int ConsecutiveFailures,
    DateTimeOffset? SuspendedAt);

public sealed record UpdateAutopayRequest(bool Enabled, Guid? PaymentMethodId, int DaysBeforeDue, MoneyDto? MaxAmount);

public sealed record AutopayRunSummary(int InvoicesEvaluated, int Charged, int Declined, int Skipped, int Errors);

/// <summary>The gateway declined a charge. Maps to 402 with the gateway's failure code.</summary>
public sealed class PaymentDeclinedException : ApplicationExceptionBase
{
    public PaymentDeclinedException(Guid paymentId, string failureCode, string? failureMessage)
        : base("payment.declined", failureMessage ?? "Your payment was declined. Please try another payment method.")
    {
        PaymentId = paymentId;
        FailureCode = failureCode;
    }

    public Guid PaymentId { get; }

    public string FailureCode { get; }
}

public sealed class PayInvoiceRequestValidator : AbstractValidator<PayInvoiceRequest>
{
    public PayInvoiceRequestValidator()
    {
        RuleFor(r => r.PaymentMethodId).NotEmpty();
        RuleFor(r => r.Amount).PositiveMoney();
    }
}

public sealed class RefundPaymentRequestValidator : AbstractValidator<RefundPaymentRequest>
{
    public RefundPaymentRequestValidator()
    {
        RuleFor(r => r.Amount).PositiveMoney();
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(300).SafeText(300);
    }
}

public sealed class AddPaymentMethodRequestValidator : AbstractValidator<AddPaymentMethodRequest>
{
    public AddPaymentMethodRequestValidator()
    {
        RuleFor(r => r.PaymentToken).NotEmpty().MaximumLength(128).Matches("^[A-Za-z0-9_-]+$")
            .WithMessage("Payment token is not in the expected format.");
    }
}

public sealed class UpdateAutopayRequestValidator : AbstractValidator<UpdateAutopayRequest>
{
    public UpdateAutopayRequestValidator()
    {
        RuleFor(r => r.PaymentMethodId).NotEmpty().When(r => r.Enabled)
            .WithMessage("Choose the payment method autopay should use.");
        RuleFor(r => r.DaysBeforeDue).InclusiveBetween(0, 10);
        RuleFor(r => r.MaxAmount).PositiveMoney().When(r => r.MaxAmount is not null);
    }
}

internal static class PaymentMapping
{
    /// <summary>Cards expiring within this many days are flagged so the customer can replace them in time.</summary>
    public const int ExpiryWarningDays = 45;

    public static PaymentDto ToDto(this Payment payment, string? invoiceNumber) => new(
        payment.Id,
        invoiceNumber,
        payment.Amount.ToDto(),
        payment.RefundedAmount.ToDto(),
        payment.Status.ToString(),
        payment.Channel.ToString(),
        payment.FailureCode,
        payment.FailureMessage,
        payment.CreatedAt,
        payment.CompletedAt);

    public static PaymentMethodDto ToDto(this PaymentMethod method, DateOnly today, AutopaySettings? autopay) => new(
        method.Id,
        method.Type.ToString(),
        method.Masked,
        method.DisplayLabel,
        method.Last4,
        method.ExpiryMonth,
        method.ExpiryYear,
        method.IsDefault,
        method.IsExpired(today),
        method.ExpiresWithin(today, ExpiryWarningDays),
        autopay is { Enabled: true } && autopay.PaymentMethodId == method.Id);

    public static AutopayDto ToDto(this AutopaySettings? settings) => settings is null
        ? new AutopayDto(false, null, 3, null, 0, null)
        : new AutopayDto(
            settings.Enabled,
            settings.PaymentMethodId,
            settings.DaysBeforeDue,
            settings.MaxAmount.ToDtoOrNull(),
            settings.ConsecutiveFailures,
            settings.SuspendedAt);
}
```

## apps/uconnect/src/Uconnect.Application/Payments/PaymentExecutor.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Payments/PaymentExecutor.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Billing;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// The single code path that takes money, shared by portal, agent and autopay payments:
/// <list type="number">
/// <item>persist a <c>Pending</c> payment before the gateway is called, so a crash leaves an audit trail;</item>
/// <item>charge the gateway with a key derived from the payment id, so resuming the same payment can never double-charge;</item>
/// <item>apply the money to the invoice, refunding immediately if the invoice can no longer accept it;</item>
/// <item>lift an arrears suspension once nothing remains overdue.</item>
/// </list>
/// A transient gateway failure propagates and leaves the payment pending for a retry to resume.
/// </summary>
public sealed class PaymentExecutor
{
    private readonly IPaymentRepository _payments;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentGateway _gateway;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<PaymentExecutor> _logger;

    public PaymentExecutor(
        IPaymentRepository payments,
        IInvoiceRepository invoices,
        IPaymentGateway gateway,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<PaymentExecutor> logger)
    {
        _payments = payments;
        _invoices = invoices;
        _gateway = gateway;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<Payment> ExecuteAsync(
        Account account,
        Invoice invoice,
        PaymentMethod method,
        Money amount,
        PaymentChannel channel,
        string idempotencyKey,
        CancellationToken ct)
    {
        EnsureChargeable(invoice, method, amount);
        var payment = new Payment(Guid.NewGuid(), account.Id, invoice.Id, method.Id, amount, channel, idempotencyKey, _clock.UtcNow);
        _payments.Add(payment);
        await _unitOfWork.SaveChangesAsync(ct);
        return await ChargeAsync(account, invoice, method, payment, ct);
    }

    /// <summary>Charges a payment that is still pending, either just created or left over from an interrupted attempt.</summary>
    public async Task<Payment> ChargeAsync(Account account, Invoice invoice, PaymentMethod method, Payment payment, CancellationToken ct)
    {
        if (payment.Status != PaymentStatus.Pending)
        {
            return payment;
        }

        var result = await _gateway.ChargeAsync(
            new GatewayChargeRequest(method.GatewayToken, payment.Amount, GatewayKey(payment), $"Invoice {invoice.InvoiceNumber}", account.Number.Value),
            ct);

        var now = _clock.UtcNow;
        if (!result.Succeeded)
        {
            payment.MarkFailed(result.FailureCode ?? "declined", result.FailureMessage, now);
            await _unitOfWork.SaveChangesAsync(ct);
            _logger.LogWarning(
                "Payment {PaymentId} of {Amount} on {InvoiceNumber} declined: {FailureCode}",
                payment.Id, payment.Amount, invoice.InvoiceNumber, payment.FailureCode);
            return payment;
        }

        payment.MarkSucceeded(result.Reference!, now);
        try
        {
            invoice.ApplyPayment(payment.Amount, now);
        }
        catch (DomainException ex)
        {
            // The invoice changed while the card was being charged (paid elsewhere, voided). Hand the money back.
            await RefundUnappliedAsync(payment, ex, ct);
            return payment;
        }

        await LiftArrearsSuspensionAsync(account, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Payment {PaymentId} of {Amount} applied to {InvoiceNumber} via {Channel}",
            payment.Id, payment.Amount, invoice.InvoiceNumber, payment.Channel);
        return payment;
    }

    internal static void EnsureChargeable(Invoice invoice, PaymentMethod method, Money amount)
    {
        if (!invoice.IsPayable)
        {
            throw new ConflictException("invoice.not_payable", $"Invoice {invoice.InvoiceNumber} is {invoice.Status.ToString().ToLowerInvariant()} and cannot be paid.");
        }

        if (amount.Currency != invoice.Currency)
        {
            throw new RequestValidationException("amount.currency", $"Invoice {invoice.InvoiceNumber} is billed in {invoice.Currency}.");
        }

        if (amount > invoice.BalanceDue)
        {
            throw new RequestValidationException("amount", $"The balance due on {invoice.InvoiceNumber} is {invoice.BalanceDue}.");
        }

        if (method.AccountId != invoice.AccountId)
        {
            throw new NotFoundException("PaymentMethod", method.Id);
        }
    }

    private static string GatewayKey(Payment payment) => $"pay-{payment.Id:N}";

    private async Task RefundUnappliedAsync(Payment payment, DomainException reason, CancellationToken ct)
    {
        var refund = await _gateway.RefundAsync(payment.GatewayReference!, payment.Amount, $"unapplied-{payment.Id:N}", ct);
        if (refund.Succeeded)
        {
            payment.Refund(payment.Amount, _clock.UtcNow);
            _logger.LogWarning(reason, "Payment {PaymentId} could not be applied and was refunded", payment.Id);
        }
        else
        {
            _logger.LogCritical(reason, "Payment {PaymentId} could not be applied and the automatic refund failed ({FailureCode}); manual action required", payment.Id, refund.FailureCode);
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task LiftArrearsSuspensionAsync(Account account, CancellationToken ct)
    {
        if (account.Status != AccountStatus.Suspended
            || account.SuspensionReason?.StartsWith(BillingRunService.ArrearsSuspensionPrefix, StringComparison.Ordinal) != true)
        {
            return;
        }

        // Tracked invoices reflect this payment in memory even before it is saved.
        var payable = await _invoices.ListPayableAsync(account.Id, ct);
        if (payable.Any(i => i.Status == InvoiceStatus.Overdue))
        {
            return;
        }

        account.Reinstate(_clock.UtcNow);
        _logger.LogInformation("Account {AccountNumber} reinstated after arrears were cleared", account.Number);
    }
}
```

## apps/uconnect/src/Uconnect.Application/Payments/PaymentMethodService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Payments/PaymentMethodService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// The account's wallet of tokenised payment methods and its autopay configuration. Card details are
/// read back from the gateway using the token, never taken from the browser.
/// </summary>
public sealed class PaymentMethodService
{
    private readonly AccountAccessGuard _guard;
    private readonly IPaymentMethodRepository _methods;
    private readonly IAutopayRepository _autopay;
    private readonly IPaymentGateway _gateway;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<AddPaymentMethodRequest> _addValidator;
    private readonly IValidator<UpdateAutopayRequest> _autopayValidator;
    private readonly ILogger<PaymentMethodService> _logger;

    public PaymentMethodService(
        AccountAccessGuard guard,
        IPaymentMethodRepository methods,
        IAutopayRepository autopay,
        IPaymentGateway gateway,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<AddPaymentMethodRequest> addValidator,
        IValidator<UpdateAutopayRequest> autopayValidator,
        ILogger<PaymentMethodService> logger)
    {
        _guard = guard;
        _methods = methods;
        _autopay = autopay;
        _gateway = gateway;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _addValidator = addValidator;
        _autopayValidator = autopayValidator;
        _logger = logger;
    }

    public async Task<IReadOnlyList<PaymentMethodDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        return await ListForAccountAsync(account.Id, ct);
    }

    public async Task<PaymentMethodDto> AddAsync(string accountNumber, AddPaymentMethodRequest request, CancellationToken ct)
    {
        await _addValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var existing = await _methods.ListByAccountAsync(account.Id, ct);
        PaymentMethodWallet.EnsureCanAdd(existing);

        if (existing.Any(m => !m.IsRemoved && string.Equals(m.GatewayToken, request.PaymentToken, StringComparison.Ordinal)))
        {
            throw new ConflictException("payment_method.duplicate", "This payment method is already saved on the account.");
        }

        var instrument = await _gateway.DescribeTokenAsync(request.PaymentToken, ct);
        var today = _clock.Today;
        var method = instrument.Type switch
        {
            PaymentMethodType.Card when instrument is { ExpiryMonth: { } month, ExpiryYear: { } year } =>
                PaymentMethod.CreateCard(Guid.NewGuid(), account.Id, request.PaymentToken, instrument.Label, instrument.Last4, month, year, today, _clock.UtcNow),
            PaymentMethodType.DirectDebit =>
                PaymentMethod.CreateDirectDebit(Guid.NewGuid(), account.Id, request.PaymentToken, instrument.Label, instrument.Last4, _clock.UtcNow),
            _ => throw new RequestValidationException("paymentToken", "The payment token does not describe a supported card or mandate."),
        };

        _methods.Add(method);
        var all = existing.Append(method).ToList();
        if (request.MakeDefault || !existing.Any(m => m.IsDefault && m.IsUsable(today)))
        {
            PaymentMethodWallet.MakeDefault(all, method.Id, today);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Payment method {PaymentMethodId} ({Type}) added to {AccountNumber}", method.Id, method.Type, account.Number);

        var autopay = await _autopay.GetByAccountAsync(account.Id, ct);
        return method.ToDto(today, autopay);
    }

    public async Task<IReadOnlyList<PaymentMethodDto>> SetDefaultAsync(string accountNumber, Guid methodId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var methods = await _methods.ListByAccountAsync(account.Id, ct);
        EnsureOnAccount(methods, methodId);
        PaymentMethodWallet.MakeDefault(methods, methodId, _clock.Today);
        await _unitOfWork.SaveChangesAsync(ct);
        return await ListForAccountAsync(account.Id, ct);
    }

    public async Task RemoveAsync(string accountNumber, Guid methodId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var methods = await _methods.ListByAccountAsync(account.Id, ct);
        EnsureOnAccount(methods, methodId);
        var autopay = await _autopay.GetByAccountAsync(account.Id, ct);
        PaymentMethodWallet.Remove(methods, methodId, autopay, _clock.Today);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Payment method {PaymentMethodId} removed from {AccountNumber}", methodId, account.Number);
    }

    public async Task<AutopayDto> GetAutopayAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        return (await _autopay.GetByAccountAsync(account.Id, ct)).ToDto();
    }

    public async Task<AutopayDto> UpdateAutopayAsync(string accountNumber, UpdateAutopayRequest request, CancellationToken ct)
    {
        await _autopayValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var settings = await _autopay.GetByAccountAsync(account.Id, ct);

        if (!request.Enabled)
        {
            settings?.Disable();
            await _unitOfWork.SaveChangesAsync(ct);
            return settings.ToDto();
        }

        account.EnsureActive();
        var methodId = request.PaymentMethodId!.Value;
        var method = await _methods.GetByIdAsync(methodId, ct);
        if (method is null || method.AccountId != account.Id)
        {
            throw new NotFoundException("PaymentMethod", methodId);
        }

        if (settings is null)
        {
            settings = new AutopaySettings(Guid.NewGuid(), account.Id);
            _autopay.Add(settings);
        }

        var maxAmount = request.MaxAmount?.ToMoney();
        if (maxAmount is not null && maxAmount.Currency != account.Currency)
        {
            throw new RequestValidationException("maxAmount.currency", $"The autopay limit must be in {account.Currency}.");
        }

        settings.Enable(method, request.DaysBeforeDue, maxAmount, _clock.Today, _clock.UtcNow);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation("Autopay enabled on {AccountNumber} using {PaymentMethodId}, {Days} days before due", account.Number, method.Id, request.DaysBeforeDue);
        return settings.ToDto();
    }

    private async Task<IReadOnlyList<PaymentMethodDto>> ListForAccountAsync(Guid accountId, CancellationToken ct)
    {
        var today = _clock.Today;
        var methods = await _methods.ListByAccountAsync(accountId, ct);
        var autopay = await _autopay.GetByAccountAsync(accountId, ct);
        return methods
            .Where(m => !m.IsRemoved)
            .OrderByDescending(m => m.IsDefault)
            .ThenByDescending(m => m.CreatedAt)
            .Select(m => m.ToDto(today, autopay))
            .ToList();
    }

    private static void EnsureOnAccount(IReadOnlyList<PaymentMethod> methods, Guid methodId)
    {
        if (!methods.Any(m => m.Id == methodId && !m.IsRemoved))
        {
            throw new NotFoundException("PaymentMethod", methodId);
        }
    }
}
```

## apps/uconnect/src/Uconnect.Application/Payments/PaymentService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Payments/PaymentService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;

namespace Uconnect.Application.Payments;

/// <summary>
/// Invoice payments made in the portal or by an agent on the phone, payment history and agent refunds.
/// Every payment request carries a client-generated idempotency key: a retry with the same key returns
/// the original outcome (or resumes a payment interrupted by a gateway outage) and never charges twice.
/// </summary>
public sealed class PaymentService
{
    public const int MaxIdempotencyKeyLength = 80;

    private readonly AccountAccessGuard _guard;
    private readonly IInvoiceRepository _invoices;
    private readonly IPaymentRepository _payments;
    private readonly IPaymentMethodRepository _methods;
    private readonly IInvoiceNumberLookup _invoiceNumbers;
    private readonly IPaymentGateway _gateway;
    private readonly PaymentExecutor _executor;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<PayInvoiceRequest> _payValidator;
    private readonly IValidator<RefundPaymentRequest> _refundValidator;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(
        AccountAccessGuard guard,
        IInvoiceRepository invoices,
        IPaymentRepository payments,
        IPaymentMethodRepository methods,
        IInvoiceNumberLookup invoiceNumbers,
        IPaymentGateway gateway,
        PaymentExecutor executor,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<PayInvoiceRequest> payValidator,
        IValidator<RefundPaymentRequest> refundValidator,
        ILogger<PaymentService> logger)
    {
        _guard = guard;
        _invoices = invoices;
        _payments = payments;
        _methods = methods;
        _invoiceNumbers = invoiceNumbers;
        _gateway = gateway;
        _executor = executor;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _payValidator = payValidator;
        _refundValidator = refundValidator;
        _logger = logger;
    }

    public async Task<PaymentDto> PayInvoiceAsync(
        string accountNumber, string invoiceNumber, PayInvoiceRequest request, string? idempotencyKey, CancellationToken ct)
    {
        await _payValidator.EnsureValidAsync(request, ct);
        var key = NormaliseIdempotencyKey(idempotencyKey);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var invoice = await _invoices.GetByNumberAsync(account.Id, invoiceNumber.Trim().ToUpperInvariant(), ct);
        if (invoice is null || invoice.Status == InvoiceStatus.Draft)
        {
            throw new NotFoundException("Invoice", invoiceNumber);
        }

        var amount = request.Amount!.ToMoney();
        var existing = await _payments.FindByIdempotencyKeyAsync(account.Id, key, ct);
        if (existing is not null)
        {
            return await ReplayAsync(account, invoice, existing, request.PaymentMethodId, amount, ct);
        }

        var method = await LoadUsableMethodAsync(account.Id, request.PaymentMethodId, ct);
        var channel = _currentUser.IsSupportAgent ? PaymentChannel.Agent : PaymentChannel.Portal;
        var payment = await _executor.ExecuteAsync(account, invoice, method, amount, channel, key, ct);
        return EnsureSucceeded(payment, invoice.InvoiceNumber);
    }

    public async Task<PagedResult<PaymentDto>> ListAsync(string accountNumber, PageRequest page, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var payments = await _payments.ListByAccountAsync(account.Id, page, ct);
        var numbers = await _invoiceNumbers.GetNumbersAsync(payments.Items.Select(p => p.InvoiceId).Distinct().ToList(), ct);
        return payments.Map(p => p.ToDto(numbers.GetValueOrDefault(p.InvoiceId)));
    }

    /// <summary>Refunds part or all of a settled payment (agents only) and reopens the invoice balance.</summary>
    public async Task<PaymentDto> RefundAsync(string accountNumber, Guid paymentId, RefundPaymentRequest request, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can issue refunds.");
        }

        await _refundValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var payment = await _payments.GetByIdAsync(paymentId, ct);
        if (payment is null || payment.AccountId != account.Id)
        {
            throw new NotFoundException("Payment", paymentId);
        }

        var amount = request.Amount!.ToMoney();
        if (amount.Currency != payment.Amount.Currency || amount > payment.RefundableAmount)
        {
            throw new RequestValidationException("amount", $"At most {payment.RefundableAmount} can be refunded on this payment.");
        }

        var invoice = await _invoices.GetByIdAsync(payment.InvoiceId, ct) ?? throw new NotFoundException("Invoice", payment.InvoiceId);

        // Key on the cumulative refunded total so a retried request is idempotent but a second refund is not blocked.
        var refundKey = $"refund-{payment.Id:N}-{payment.RefundedAmount.AmountMinor + amount.AmountMinor}";
        var result = await _gateway.RefundAsync(payment.GatewayReference!, amount, refundKey, ct);
        if (!result.Succeeded)
        {
            throw new ConflictException("refund.rejected", $"The payment gateway rejected the refund ({result.FailureCode}).");
        }

        payment.Refund(amount, _clock.UtcNow);
        invoice.ReversePayment(amount, _clock.Today);
        await _unitOfWork.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Refund of {Amount} on payment {PaymentId} ({InvoiceNumber}) by agent {UserId}: {Reason}",
            amount, payment.Id, invoice.InvoiceNumber, _currentUser.UserId, request.Reason);
        return payment.ToDto(invoice.InvoiceNumber);
    }

    internal static string NormaliseIdempotencyKey(string? idempotencyKey)
    {
        var key = idempotencyKey?.Trim();
        if (string.IsNullOrEmpty(key) || key.Length > MaxIdempotencyKeyLength || key.Any(char.IsControl))
        {
            throw new RequestValidationException("idempotencyKey", $"An Idempotency-Key header of 1 to {MaxIdempotencyKeyLength} characters is required.");
        }

        return key;
    }

    private async Task<PaymentDto> ReplayAsync(
        Account account, Invoice invoice, Payment existing, Guid paymentMethodId, Money amount, CancellationToken ct)
    {
        if (existing.InvoiceId != invoice.Id || existing.PaymentMethodId != paymentMethodId || existing.Amount != amount)
        {
            throw new ConflictException("payment.idempotency_key_reused", "This idempotency key was already used for a different payment.");
        }

        if (existing.Status == PaymentStatus.Pending)
        {
            var method = await LoadUsableMethodAsync(account.Id, existing.PaymentMethodId, ct);
            existing = await _executor.ChargeAsync(account, invoice, method, existing, ct);
        }

        return EnsureSucceeded(existing, invoice.InvoiceNumber);
    }

    private async Task<PaymentMethod> LoadUsableMethodAsync(Guid accountId, Guid methodId, CancellationToken ct)
    {
        var method = await _methods.GetByIdAsync(methodId, ct);
        if (method is null || method.AccountId != accountId || method.IsRemoved)
        {
            throw new NotFoundException("PaymentMethod", methodId);
        }

        method.EnsureUsable(_clock.Today);
        return method;
    }

    private static PaymentDto EnsureSucceeded(Payment payment, string invoiceNumber) => payment.Status == PaymentStatus.Failed
        ? throw new PaymentDeclinedException(payment.Id, payment.FailureCode ?? "declined", payment.FailureMessage)
        : payment.ToDto(invoiceNumber);
}
```

## apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.PlanChanges;

namespace Uconnect.Application.PlanChanges;

public sealed record PlanChangeQuoteRequest(Guid ServiceId, string ToPlanCode, DateOnly? EffectiveOn);

/// <summary>Accepting a quote. <see cref="AcceptedNetAmountMinor"/> guards against prices moving between quote and accept.</summary>
public sealed record RequestPlanChangeRequest(Guid ServiceId, string ToPlanCode, DateOnly? EffectiveOn, long AcceptedNetAmountMinor, bool AcceptTerms);

public sealed record ProrationDto(MoneyDto Credit, MoneyDto Charge, MoneyDto Net, int DaysRemaining, int DaysInPeriod, DateOnly PeriodStart, DateOnly PeriodEnd);

public sealed record PlanChangeQuoteDto(
    Guid ServiceId,
    string FromPlanCode,
    string ToPlanCode,
    string ChangeType,
    DateOnly EffectiveOn,
    MoneyDto CurrentMonthlyPrice,
    MoneyDto NewMonthlyPrice,
    MoneyDto MonthlyDifference,
    ProrationDto? Proration,
    MoneyDto EarlyTerminationFee,
    MoneyDto OneOffTotal,
    bool ResetsContract,
    DateOnly? ContractEndsOn);

public sealed record PlanChangeDto(
    Guid Id,
    Guid ServiceId,
    string FromPlanCode,
    string ToPlanCode,
    string ChangeType,
    string Status,
    DateOnly EffectiveOn,
    MoneyDto NewMonthlyPrice,
    MoneyDto ProrationCredit,
    MoneyDto ProrationCharge,
    MoneyDto EarlyTerminationFee,
    string? FailureReason,
    DateTimeOffset RequestedAt,
    DateTimeOffset? CompletedAt,
    bool CanCancel);

public sealed class PlanChangeQuoteRequestValidator : AbstractValidator<PlanChangeQuoteRequest>
{
    public PlanChangeQuoteRequestValidator()
    {
        RuleFor(r => r.ServiceId).NotEmpty();
        RuleFor(r => r.ToPlanCode).NotEmpty().MaximumLength(40).Matches("^[A-Za-z0-9-]+$");
    }
}

public sealed class RequestPlanChangeRequestValidator : AbstractValidator<RequestPlanChangeRequest>
{
    public RequestPlanChangeRequestValidator()
    {
        RuleFor(r => r.ServiceId).NotEmpty();
        RuleFor(r => r.ToPlanCode).NotEmpty().MaximumLength(40).Matches("^[A-Za-z0-9-]+$");
        RuleFor(r => r.AcceptTerms).Equal(true).WithMessage("You must accept the plan change terms.");
    }
}

internal static class PlanChangeMapping
{
    public static PlanChangeQuoteDto ToDto(this PlanChangeQuote quote, string fromCode, string toCode) => new(
        quote.ServiceId,
        fromCode,
        toCode,
        quote.ChangeType.ToString(),
        quote.EffectiveOn,
        quote.CurrentMonthlyPrice.ToDto(),
        quote.NewMonthlyPrice.ToDto(),
        quote.MonthlyDifference.ToDto(),
        quote.Proration is { } p
            ? new ProrationDto(p.Credit.ToDto(), p.Charge.ToDto(), p.Net.ToDto(), p.DaysRemaining, p.DaysInPeriod, p.Period.Start, p.Period.End)
            : null,
        quote.EarlyTerminationFee.ToDto(),
        quote.OneOffTotal.ToDto(),
        quote.ResetsContract,
        quote.ContractEndsOn);

    public static PlanChangeDto ToDto(this PlanChange change, string fromCode, string toCode) => new(
        change.Id,
        change.ServiceId,
        fromCode,
        toCode,
        change.ChangeType.ToString(),
        change.Status.ToString(),
        change.EffectiveOn,
        change.NewMonthlyPrice.ToDto(),
        change.ProrationCredit.ToDto(),
        change.ProrationCharge.ToDto(),
        change.EarlyTerminationFee.ToDto(),
        change.FailureReason,
        change.RequestedAt,
        change.CompletedAt,
        change.Status is PlanChangeStatus.Requested or PlanChangeStatus.Scheduled);
}
```

## apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeProcessor.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeProcessor.cs`.

```csharp
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Application.PlanChanges;

/// <summary>Result of one processor pass, for logging and metrics.</summary>
public sealed record PlanChangeRunSummary(int Submitted, int Completed, int Failed, int Retried, int Errors);

/// <summary>
/// Drives plan changes through provisioning: submits due changes, polls in-flight orders, and
/// applies the outcome (or a webhook callback) to the service. Failed orders are retried until
/// <see cref="PlanChange.MaxProvisioningAttempts"/> is reached, after which the service is released
/// and a <see cref="PlanChangeFailed"/> event lets support follow up.
/// </summary>
public sealed class PlanChangeProcessor
{
    private readonly IPlanChangeRepository _planChanges;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly IProvisioningClient _provisioning;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<PlanChangeProcessor> _logger;

    public PlanChangeProcessor(
        IPlanChangeRepository planChanges,
        IServiceRepository services,
        IPlanRepository plans,
        IProvisioningClient provisioning,
        IUnitOfWork unitOfWork,
        IClock clock,
        ILogger<PlanChangeProcessor> logger)
    {
        _planChanges = planChanges;
        _services = services;
        _plans = plans;
        _provisioning = provisioning;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<PlanChangeRunSummary> RunAsync(CancellationToken ct)
    {
        int submitted = 0, completed = 0, failed = 0, retried = 0, errors = 0;

        foreach (var change in await _planChanges.ListDueAsync(_clock.Today, ct))
        {
            try
            {
                var (service, from, to) = await LoadAsync(change, ct);
                if (await TrySubmitAsync(change, service, from, to, ct))
                {
                    submitted++;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Failed to submit plan change {PlanChangeId}", change.Id);
            }
        }

        foreach (var change in await _planChanges.ListProvisioningAsync(ct))
        {
            try
            {
                var status = await _provisioning.GetOrderStatusAsync(change.ProvisioningOrderRef!, ct);
                switch (await ApplyStatusAsync(change, status, ct))
                {
                    case PlanChangeStatus.Completed:
                        completed++;
                        break;
                    case PlanChangeStatus.Failed:
                        failed++;
                        break;
                    case PlanChangeStatus.Provisioning when change.ProvisioningOrderRef != status.OrderRef:
                        retried++;
                        break;
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                errors++;
                _logger.LogError(ex, "Failed to poll provisioning for plan change {PlanChangeId}", change.Id);
            }
        }

        return new PlanChangeRunSummary(submitted, completed, failed, retried, errors);
    }

    /// <summary>Handles an asynchronous status callback from the provisioning platform.</summary>
    public async Task HandleCallbackAsync(ProvisioningOrderStatus status, CancellationToken ct)
    {
        var change = await _planChanges.GetByProvisioningRefAsync(status.OrderRef, ct)
            ?? throw new NotFoundException("ProvisioningOrder", status.OrderRef);

        if (change.Status != PlanChangeStatus.Provisioning)
        {
            _logger.LogInformation("Ignoring duplicate provisioning callback for {OrderRef}; plan change is {Status}", status.OrderRef, change.Status);
            return;
        }

        await ApplyStatusAsync(change, status, ct);
    }

    /// <summary>
    /// Sends a change to provisioning. Returns false (leaving the change for the next run) when the
    /// platform is temporarily unavailable.
    /// </summary>
    internal async Task<bool> TrySubmitAsync(PlanChange change, Service service, Plan from, Plan to, CancellationToken ct)
    {
        try
        {
            var accepted = await _provisioning.SubmitPlanChangeAsync(
                new ProvisioningOrderRequest(change.Id, service.ServiceReference, from.Code, to.Code, to.DownloadMbps, to.UploadMbps, change.EffectiveOn),
                ct);
            change.MarkProvisioning(accepted.OrderRef, _clock.UtcNow);
            await _unitOfWork.SaveChangesAsync(ct);
            _logger.LogInformation("Plan change {PlanChangeId} submitted to provisioning as {OrderRef}", change.Id, accepted.OrderRef);
            return true;
        }
        catch (ExternalServiceException ex) when (ex.IsTransient)
        {
            _logger.LogWarning(ex, "Provisioning unavailable; plan change {PlanChangeId} will be retried", change.Id);
            return false;
        }
    }

    private async Task<PlanChangeStatus> ApplyStatusAsync(PlanChange change, ProvisioningOrderStatus status, CancellationToken ct)
    {
        switch (status.State)
        {
            case ProvisioningOrderState.Pending:
                return change.Status;

            case ProvisioningOrderState.Completed:
            {
                var (service, _, to) = await LoadAsync(change, ct);
                service.ApplyPlan(to, change.ChangeType, change.EffectiveOn, change.Id);
                change.Complete(status.CompletedAt ?? _clock.UtcNow);
                await _unitOfWork.SaveChangesAsync(ct);
                _logger.LogInformation("Plan change {PlanChangeId} completed; service {ServiceReference} now on {PlanCode}", change.Id, service.ServiceReference, to.Code);
                return PlanChangeStatus.Completed;
            }

            case ProvisioningOrderState.Failed:
            {
                var reason = string.IsNullOrWhiteSpace(status.FailureReason) ? "Provisioning reported a failure." : status.FailureReason;
                var (service, from, to) = await LoadAsync(change, ct);
                change.Fail(reason, _clock.UtcNow);

                if (change.ProvisioningAttempts < PlanChange.MaxProvisioningAttempts)
                {
                    await _unitOfWork.SaveChangesAsync(ct);
                    _logger.LogWarning("Plan change {PlanChangeId} failed (attempt {Attempt}): {Reason}; retrying", change.Id, change.ProvisioningAttempts, reason);
                    return await TrySubmitAsync(change, service, from, to, ct) ? PlanChangeStatus.Provisioning : PlanChangeStatus.Failed;
                }

                service.ReleasePendingPlanChange(change.Id);
                await _unitOfWork.SaveChangesAsync(ct);
                _logger.LogError("Plan change {PlanChangeId} failed permanently after {Attempts} attempts: {Reason}", change.Id, change.ProvisioningAttempts, reason);
                return PlanChangeStatus.Failed;
            }

            default:
                throw new ArgumentOutOfRangeException(nameof(status), status.State, "Unknown provisioning state.");
        }
    }

    private async Task<(Service Service, Plan From, Plan To)> LoadAsync(PlanChange change, CancellationToken ct)
    {
        var service = await _services.GetByIdAsync(change.ServiceId, ct) ?? throw new NotFoundException("Service", change.ServiceId);
        var from = await _plans.GetByIdAsync(change.FromPlanId, ct) ?? throw new NotFoundException("Plan", change.FromPlanId);
        var to = await _plans.GetByIdAsync(change.ToPlanId, ct) ?? throw new NotFoundException("Plan", change.ToPlanId);
        return (service, from, to);
    }
}
```

## apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/PlanChanges/PlanChangeService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;

namespace Uconnect.Application.PlanChanges;

/// <summary>
/// Customer-facing plan changes: quote (with proration and early-change fee), accept, list and
/// cancel. Immediate upgrades are sent to provisioning straight away; anything future-dated is
/// scheduled and picked up by <see cref="PlanChangeProcessor"/>.
/// </summary>
public sealed class PlanChangeService
{
    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly IPlanRepository _plans;
    private readonly IPlanChangeRepository _planChanges;
    private readonly PlanChangeProcessor _processor;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<PlanChangeQuoteRequest> _quoteValidator;
    private readonly IValidator<RequestPlanChangeRequest> _requestValidator;
    private readonly ILogger<PlanChangeService> _logger;

    public PlanChangeService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        IPlanRepository plans,
        IPlanChangeRepository planChanges,
        PlanChangeProcessor processor,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<PlanChangeQuoteRequest> quoteValidator,
        IValidator<RequestPlanChangeRequest> requestValidator,
        ILogger<PlanChangeService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _plans = plans;
        _planChanges = planChanges;
        _processor = processor;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _quoteValidator = quoteValidator;
        _requestValidator = requestValidator;
        _logger = logger;
    }

    public async Task<PlanChangeQuoteDto> QuoteAsync(string accountNumber, PlanChangeQuoteRequest request, CancellationToken ct)
    {
        await _quoteValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var context = await LoadContextAsync(account, request.ServiceId, request.ToPlanCode, ct);

        var quote = PlanChangePolicy.Quote(account, context.Service, context.CurrentPlan, context.TargetPlan, _clock.Today, request.EffectiveOn);
        return quote.ToDto(context.CurrentPlan.Code, context.TargetPlan.Code);
    }

    /// <summary>
    /// Accepts a plan change. The quote is recomputed server-side and must match the amount the
    /// customer saw, otherwise the request is rejected so they can review the new figures.
    /// </summary>
    public async Task<PlanChangeDto> RequestAsync(string accountNumber, RequestPlanChangeRequest request, CancellationToken ct)
    {
        await _requestValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var context = await LoadContextAsync(account, request.ServiceId, request.ToPlanCode, ct);
        var today = _clock.Today;

        var quote = PlanChangePolicy.Quote(account, context.Service, context.CurrentPlan, context.TargetPlan, today, request.EffectiveOn);
        if (quote.OneOffTotal.AmountMinor != request.AcceptedNetAmountMinor)
        {
            throw new ConflictException(
                "plan_change.quote_changed",
                $"The price for this change is now {quote.OneOffTotal}; please review the updated quote.");
        }

        var change = new PlanChange(Guid.NewGuid(), account.Id, quote, _currentUser.UserId, _clock.UtcNow);
        context.Service.AttachPendingPlanChange(change.Id);
        _planChanges.Add(change);

        if (change.EffectiveOn > today)
        {
            change.Schedule();
        }

        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Plan change {PlanChangeId} ({ChangeType}) requested for service {ServiceReference}: {FromPlan} -> {ToPlan}, effective {EffectiveOn}",
            change.Id, change.ChangeType, context.Service.ServiceReference, context.CurrentPlan.Code, context.TargetPlan.Code, change.EffectiveOn);

        if (change.IsDue(today))
        {
            // Best effort: if provisioning is unavailable the scheduled processor retries the submission.
            await _processor.TrySubmitAsync(change, context.Service, context.CurrentPlan, context.TargetPlan, ct);
        }

        return change.ToDto(context.CurrentPlan.Code, context.TargetPlan.Code);
    }

    public async Task<IReadOnlyList<PlanChangeDto>> ListAsync(string accountNumber, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var changes = await _planChanges.ListByAccountAsync(account.Id, ct);
        if (changes.Count == 0)
        {
            return Array.Empty<PlanChangeDto>();
        }

        var planIds = changes.SelectMany(c => new[] { c.FromPlanId, c.ToPlanId }).Distinct();
        var codes = (await _plans.GetManyAsync(planIds, ct)).ToDictionary(p => p.Id, p => p.Code);
        return changes
            .OrderByDescending(c => c.RequestedAt)
            .Select(c => c.ToDto(codes.GetValueOrDefault(c.FromPlanId, "?"), codes.GetValueOrDefault(c.ToPlanId, "?")))
            .ToList();
    }

    /// <summary>Cancels a change that has not yet been sent to provisioning.</summary>
    public async Task<PlanChangeDto> CancelAsync(string accountNumber, Guid planChangeId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Manage, ct);
        var change = await _planChanges.GetByIdAsync(planChangeId, ct);
        if (change is null || change.AccountId != account.Id)
        {
            throw new NotFoundException("PlanChange", planChangeId);
        }

        if (change.Status == PlanChangeStatus.Provisioning)
        {
            throw new ConflictException("plan_change.in_provisioning", "This change is already being applied to your service and can no longer be cancelled.");
        }

        var service = await _inventory.LoadOwnedServiceAsync(account.Id, change.ServiceId, ct);
        change.Cancel(_clock.UtcNow);
        service.ReleasePendingPlanChange(change.Id);
        await _unitOfWork.SaveChangesAsync(ct);

        var plans = (await _plans.GetManyAsync(new[] { change.FromPlanId, change.ToPlanId }, ct)).ToDictionary(p => p.Id, p => p.Code);
        return change.ToDto(plans.GetValueOrDefault(change.FromPlanId, "?"), plans.GetValueOrDefault(change.ToPlanId, "?"));
    }

    private async Task<(Service Service, Plan CurrentPlan, Plan TargetPlan)> LoadContextAsync(
        Account account, Guid serviceId, string toPlanCode, CancellationToken ct)
    {
        var service = await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
        var currentPlan = await _plans.GetByIdAsync(service.PlanId, ct)
            ?? throw new NotFoundException("Plan", service.PlanId);
        var targetPlan = await _plans.GetByCodeAsync(toPlanCode.Trim().ToUpperInvariant(), ct)
            ?? throw new NotFoundException("Plan", toPlanCode);
        return (service, currentPlan, targetPlan);
    }
}
```

## apps/uconnect/src/Uconnect.Application/Services/ServiceDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Services/ServiceDtos.cs`.

```csharp
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
```

## apps/uconnect/src/Uconnect.Application/Services/ServiceInventoryService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Services/ServiceInventoryService.cs`.

```csharp
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Services;

namespace Uconnect.Application.Services;

/// <summary>Read-side view of the services on an account and the plans each could move to.</summary>
public sealed class ServiceInventoryService
{
    private readonly AccountAccessGuard _guard;
    private readonly IServiceRepository _services;
    private readonly IPlanRepository _plans;
    private readonly ITicketRepository _tickets;
    private readonly IOutageRepository _outages;
    private readonly IClock _clock;

    public ServiceInventoryService(
        AccountAccessGuard guard,
        IServiceRepository services,
        IPlanRepository plans,
        ITicketRepository tickets,
        IOutageRepository outages,
        IClock clock)
    {
        _guard = guard;
        _services = services;
        _plans = plans;
        _tickets = tickets;
        _outages = outages;
        _clock = clock;
    }

    public async Task<IReadOnlyList<ServiceSummaryDto>> ListAsync(string accountNumber, bool includeCancelled, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var services = (await _services.ListByAccountAsync(account.Id, ct))
            .Where(s => includeCancelled || s.Status != ServiceStatus.Cancelled)
            .ToList();
        if (services.Count == 0)
        {
            return Array.Empty<ServiceSummaryDto>();
        }

        var plans = (await _plans.GetManyAsync(services.Select(s => s.PlanId).Distinct(), ct)).ToDictionary(p => p.Id);
        return services
            .OrderBy(s => s.Status == ServiceStatus.Cancelled)
            .ThenBy(s => s.ServiceReference, StringComparer.Ordinal)
            .Select(s => s.ToSummaryDto(plans[s.PlanId]))
            .ToList();
    }

    public async Task<ServiceDetailDto> GetAsync(string accountNumber, Guid serviceId, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var service = await LoadOwnedServiceAsync(account.Id, serviceId, ct);
        var currentPlan = await _plans.GetByIdAsync(service.PlanId, ct)
            ?? throw new NotFoundException("Plan", service.PlanId);

        var options = service.Status == ServiceStatus.Active
            ? await BuildPlanOptionsAsync(account.Type, service, currentPlan, ct)
            : Array.Empty<PlanOptionDto>();

        var openTickets = await _tickets.ListOpenByServiceAsync(service.Id, ct);
        var outages = await _outages.ListCurrentAsync(_clock.UtcNow, ct);
        var affected = outages.Any(o => !o.IsResolved && o.Affects(service.ServiceAddress));

        return new ServiceDetailDto(
            service.ToSummaryDto(currentPlan),
            service.RemainingContractMonths(_clock.Today),
            options,
            openTickets.Count,
            affected);
    }

    /// <summary>Loads a service and confirms it belongs to the account; otherwise reports not found.</summary>
    internal async Task<Service> LoadOwnedServiceAsync(Guid accountId, Guid serviceId, CancellationToken ct)
    {
        var service = await _services.GetByIdAsync(serviceId, ct);
        if (service is null || service.AccountId != accountId)
        {
            throw new NotFoundException("Service", serviceId);
        }

        return service;
    }

    private async Task<IReadOnlyList<PlanOptionDto>> BuildPlanOptionsAsync(AccountType accountType, Service service, Plan currentPlan, CancellationToken ct)
    {
        var candidates = await _plans.ListActiveAsync(service.ProductType, ct);
        return candidates
            .Where(p => p.Id != currentPlan.Id && p.IsAvailableTo(accountType) && p.MonthlyPrice.Currency == service.MonthlyPrice.Currency)
            .OrderBy(p => p.Tier)
            .ThenBy(p => p.MonthlyPrice.AmountMinor)
            .Select(p => new PlanOptionDto(
                p.ToDto(),
                currentPlan.ClassifyChangeTo(p).ToString(),
                (p.MonthlyPrice - service.MonthlyPrice).ToDto()))
            .ToList();
    }
}
```

## apps/uconnect/src/Uconnect.Application/Tickets/TicketDtos.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Tickets/TicketDtos.cs`.

```csharp
using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Tickets;

public sealed record TicketSummaryDto(
    string Reference,
    string Subject,
    string Category,
    string Priority,
    string Status,
    Guid? ServiceId,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastActivityAt,
    DateTimeOffset ResolutionDueAt,
    bool SlaBreached);

public sealed record TicketCommentDto(Guid Id, string AuthorName, string Body, bool IsAgent, bool IsInternal, DateTimeOffset CreatedAt);

public sealed record TicketDetailDto(
    TicketSummaryDto Summary,
    string Description,
    string? ResolutionSummary,
    DateTimeOffset? FirstRespondedAt,
    DateTimeOffset FirstResponseDueAt,
    DateTimeOffset? ResolvedAt,
    int ReopenCount,
    bool CanReopen,
    bool CanClose,
    IReadOnlyList<TicketCommentDto> Comments);

/// <summary>
/// Customers describe the problem; priority is derived by triage, never chosen.
/// <see cref="ServiceDown"/> means the service is completely unusable.
/// </summary>
public sealed record CreateTicketRequest(Guid? ServiceId, string Category, string Subject, string Description, bool ServiceDown);

public sealed record AddTicketCommentRequest(string Body, bool Internal);

public sealed record ReopenTicketRequest(string Reason);

public sealed record ResolveTicketRequest(string Summary);

public sealed record EscalateTicketRequest(string Priority, string Reason);

public sealed class CreateTicketRequestValidator : AbstractValidator<CreateTicketRequest>
{
    public CreateTicketRequestValidator()
    {
        RuleFor(r => r.Category).Must(EnumParsing.IsValid<TicketCategory>)
            .WithMessage($"Category must be one of: {string.Join(", ", Enum.GetNames<TicketCategory>())}.");
        RuleFor(r => r.ServiceId).NotEmpty()
            .When(r => EnumParsing.TryParse<TicketCategory>(r.Category, out var c) && c == TicketCategory.Fault)
            .WithMessage("Choose the service that has the fault.");
        RuleFor(r => r.Subject).NotEmpty().MaximumLength(150).SafeText(150);
        RuleFor(r => r.Description).NotEmpty().MaximumLength(4000).SafeText(4000);
    }
}

public sealed class AddTicketCommentRequestValidator : AbstractValidator<AddTicketCommentRequest>
{
    public AddTicketCommentRequestValidator()
    {
        RuleFor(r => r.Body).NotEmpty().MaximumLength(4000).SafeText(4000);
    }
}

public sealed class ReopenTicketRequestValidator : AbstractValidator<ReopenTicketRequest>
{
    public ReopenTicketRequestValidator()
    {
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(1000).SafeText(1000);
    }
}

public sealed class ResolveTicketRequestValidator : AbstractValidator<ResolveTicketRequest>
{
    public ResolveTicketRequestValidator()
    {
        RuleFor(r => r.Summary).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

public sealed class EscalateTicketRequestValidator : AbstractValidator<EscalateTicketRequest>
{
    public EscalateTicketRequestValidator()
    {
        RuleFor(r => r.Priority).Must(EnumParsing.IsValid<TicketPriority>).WithMessage("Priority must be P1, P2, P3 or P4.");
        RuleFor(r => r.Reason).NotEmpty().MaximumLength(1000).SafeText(1000);
    }
}

internal static class TicketMapping
{
    public static TicketSummaryDto ToSummaryDto(this Ticket ticket, DateTimeOffset now) => new(
        ticket.Reference,
        ticket.Subject,
        ticket.Category.ToString(),
        ticket.Priority.ToString(),
        ticket.Status.ToString(),
        ticket.ServiceId,
        ticket.CreatedAt,
        ticket.LastActivityAt,
        ticket.ResolutionDueAt,
        ticket.IsFirstResponseBreached(now) || ticket.IsResolutionBreached(now));

    public static TicketDetailDto ToDetailDto(this Ticket ticket, DateTimeOffset now, bool includeInternal) => new(
        ticket.ToSummaryDto(now),
        ticket.Description,
        ticket.ResolutionSummary,
        ticket.FirstRespondedAt,
        ticket.FirstResponseDueAt,
        ticket.ResolvedAt,
        ticket.ReopenCount,
        CanReopen(ticket, now),
        ticket.Status is TicketStatus.Open or TicketStatus.PendingCustomer or TicketStatus.Resolved,
        ticket.Comments
            .Where(c => includeInternal || !c.IsInternal)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new TicketCommentDto(c.Id, c.AuthorName, c.Body, c.IsAgent, c.IsInternal, c.CreatedAt))
            .ToList());

    private static bool CanReopen(Ticket ticket, DateTimeOffset now) =>
        ticket.Status == TicketStatus.Resolved
        && ticket.ResolvedAt is { } resolved
        && (now - resolved).TotalDays <= Ticket.ReopenWindowDays
        && ticket.ReopenCount < Ticket.MaxReopens;
}
```

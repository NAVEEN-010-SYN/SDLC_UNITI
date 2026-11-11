# Uconnect account & service management: apps/uconnect/src (part 4 of 8)

- **Application:** Uconnect account & service management
- **Tech stack:** .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 12

## Files

- `apps/uconnect/src/Uconnect.Application/Tickets/TicketService.cs` (278 lines)
- `apps/uconnect/src/Uconnect.Application/Uconnect.Application.csproj` (25 lines)
- `apps/uconnect/src/Uconnect.Application/Usage/UsageService.cs` (188 lines)
- `apps/uconnect/src/Uconnect.Domain/Accounts/Account.cs` (204 lines)
- `apps/uconnect/src/Uconnect.Domain/Accounts/AccountUser.cs` (139 lines)
- `apps/uconnect/src/Uconnect.Domain/Appointments/Appointment.cs` (233 lines)
- `apps/uconnect/src/Uconnect.Domain/Appointments/AppointmentSlot.cs` (150 lines)
- `apps/uconnect/src/Uconnect.Domain/Billing/AccountAdjustment.cs` (114 lines)
- `apps/uconnect/src/Uconnect.Domain/Billing/Invoice.cs` (263 lines)
- `apps/uconnect/src/Uconnect.Domain/Billing/InvoiceBuilder.cs` (133 lines)
- `apps/uconnect/src/Uconnect.Domain/Billing/InvoiceLine.cs` (90 lines)
- `apps/uconnect/src/Uconnect.Domain/Catalog/Plan.cs` (141 lines)

## apps/uconnect/src/Uconnect.Application/Tickets/TicketService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Tickets/TicketService.cs`.

```csharp
using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Tickets;

/// <summary>
/// Support tickets for customers and agents. Customers raise, comment, reopen and withdraw; agents
/// additionally assign, request information, resolve, escalate and add internal notes. Fault tickets are
/// de-duplicated per service and automatically linked to any known network outage at the address.
/// </summary>
public sealed class TicketService
{
    private readonly AccountAccessGuard _guard;
    private readonly ServiceInventoryService _inventory;
    private readonly ITicketRepository _tickets;
    private readonly IOutageRepository _outages;
    private readonly IReferenceGenerator _references;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly IValidator<CreateTicketRequest> _createValidator;
    private readonly IValidator<AddTicketCommentRequest> _commentValidator;
    private readonly IValidator<ReopenTicketRequest> _reopenValidator;
    private readonly IValidator<ResolveTicketRequest> _resolveValidator;
    private readonly IValidator<EscalateTicketRequest> _escalateValidator;
    private readonly ILogger<TicketService> _logger;

    public TicketService(
        AccountAccessGuard guard,
        ServiceInventoryService inventory,
        ITicketRepository tickets,
        IOutageRepository outages,
        IReferenceGenerator references,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IClock clock,
        IValidator<CreateTicketRequest> createValidator,
        IValidator<AddTicketCommentRequest> commentValidator,
        IValidator<ReopenTicketRequest> reopenValidator,
        IValidator<ResolveTicketRequest> resolveValidator,
        IValidator<EscalateTicketRequest> escalateValidator,
        ILogger<TicketService> logger)
    {
        _guard = guard;
        _inventory = inventory;
        _tickets = tickets;
        _outages = outages;
        _references = references;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _createValidator = createValidator;
        _commentValidator = commentValidator;
        _reopenValidator = reopenValidator;
        _resolveValidator = resolveValidator;
        _escalateValidator = escalateValidator;
        _logger = logger;
    }

    public async Task<PagedResult<TicketSummaryDto>> ListAsync(string accountNumber, bool openOnly, PageRequest page, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.View, ct);
        var tickets = await _tickets.ListByAccountAsync(account.Id, openOnly, page, ct);
        var now = _clock.UtcNow;
        return tickets.Map(t => t.ToSummaryDto(now));
    }

    public async Task<TicketDetailDto> GetAsync(string accountNumber, string reference, CancellationToken ct)
    {
        var (_, ticket) = await LoadAsync(accountNumber, reference, AccountPermission.View, ct);
        return ticket.ToDetailDto(_clock.UtcNow, _currentUser.IsSupportAgent);
    }

    public async Task<TicketDetailDto> CreateAsync(string accountNumber, CreateTicketRequest request, CancellationToken ct)
    {
        await _createValidator.EnsureValidAsync(request, ct);
        var account = await _guard.AuthorizeAsync(accountNumber, AccountPermission.Support, ct);
        var category = EnumParsing.Parse<TicketCategory>(request.Category, "category");
        var now = _clock.UtcNow;

        Service? service = null;
        Outage? outage = null;
        if (request.ServiceId is { } serviceId)
        {
            service = await _inventory.LoadOwnedServiceAsync(account.Id, serviceId, ct);
            if (category == TicketCategory.Fault)
            {
                await EnsureNoOpenFaultAsync(service, ct);
                outage = (await _outages.ListCurrentAsync(now, ct)).FirstOrDefault(o => !o.IsResolved && o.Affects(service.ServiceAddress));
            }
        }

        var priority = TicketTriage.DeterminePriority(category, request.ServiceDown, account.IsBusiness, outage is not null);
        var reference = await _references.NextAsync(ReferenceKind.Ticket, ct);
        var ticket = new Ticket(
            Guid.NewGuid(), reference, account.Id, service?.Id, category, priority, request.Subject, request.Description, _currentUser.UserId, now);

        if (outage is not null)
        {
            ticket.AddAgentComment(
                SystemActors.NetworkOperations,
                SystemActors.NetworkOperationsName,
                $"Your service is affected by known incident {outage.Reference} ({outage.Title}). Our engineers are working on it and this ticket will be updated when service is restored.",
                isInternal: false,
                now);
        }

        _tickets.Add(ticket);
        await _unitOfWork.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Ticket {Reference} ({Category}, {Priority}) raised on {AccountNumber}; linked outage {OutageReference}",
            reference, category, priority, account.Number, outage?.Reference);
        return ticket.ToDetailDto(now, _currentUser.IsSupportAgent);
    }

    public async Task<TicketDetailDto> AddCommentAsync(string accountNumber, string reference, AddTicketCommentRequest request, CancellationToken ct)
    {
        await _commentValidator.EnsureValidAsync(request, ct);
        var (_, ticket) = await LoadAsync(accountNumber, reference, AccountPermission.Support, ct);
        var now = _clock.UtcNow;

        if (_currentUser.IsSupportAgent)
        {
            ticket.AddAgentComment(_currentUser.UserId, _currentUser.DisplayName, request.Body, request.Internal, now);
        }
        else if (request.Internal)
        {
            throw new ForbiddenException("Only agents can add internal notes.");
        }
        else
        {
            ticket.AddCustomerComment(_currentUser.UserId, _currentUser.DisplayName, request.Body, now);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return ticket.ToDetailDto(now, _currentUser.IsSupportAgent);
    }

    public Task<TicketDetailDto> ReopenAsync(string accountNumber, string reference, ReopenTicketRequest request, CancellationToken ct) =>
        MutateAsync(accountNumber, reference, AccountPermission.Support, _reopenValidator, request,
            (ticket, now) => ticket.Reopen(request.Reason, _currentUser.UserId, _currentUser.DisplayName, now), ct);

    /// <summary>Customer withdraws an open ticket or confirms a resolution; agents close stale cases.</summary>
    public Task<TicketDetailDto> CloseAsync(string accountNumber, string reference, CancellationToken ct) =>
        MutateAsync<object?>(accountNumber, reference, AccountPermission.Support, null, null, (ticket, now) => ticket.Close(now), ct);

    public Task<TicketDetailDto> AssignToMeAsync(string accountNumber, string reference, CancellationToken ct) =>
        AgentMutateAsync<object?>(accountNumber, reference, null, null, (ticket, now) => ticket.Assign(_currentUser.UserId, now), ct);

    /// <summary>Agent asks the customer for information: posts the question and pauses the SLA clock.</summary>
    public Task<TicketDetailDto> RequestCustomerInfoAsync(string accountNumber, string reference, AddTicketCommentRequest request, CancellationToken ct) =>
        AgentMutateAsync(accountNumber, reference, _commentValidator, request, (ticket, now) =>
        {
            ticket.AddAgentComment(_currentUser.UserId, _currentUser.DisplayName, request.Body, isInternal: false, now);
            ticket.AwaitCustomer(now);
        }, ct);

    public Task<TicketDetailDto> ResolveAsync(string accountNumber, string reference, ResolveTicketRequest request, CancellationToken ct) =>
        AgentMutateAsync(accountNumber, reference, _resolveValidator, request, (ticket, now) =>
        {
            ticket.AddAgentComment(_currentUser.UserId, _currentUser.DisplayName, request.Summary, isInternal: false, now);
            ticket.Resolve(request.Summary, now);
        }, ct);

    public Task<TicketDetailDto> EscalateAsync(string accountNumber, string reference, EscalateTicketRequest request, CancellationToken ct) =>
        AgentMutateAsync(accountNumber, reference, _escalateValidator, request, (ticket, now) => ticket.Escalate(
            EnumParsing.Parse<TicketPriority>(request.Priority, "priority"), request.Reason, _currentUser.UserId, _currentUser.DisplayName, now), ct);

    private async Task EnsureNoOpenFaultAsync(Service service, CancellationToken ct)
    {
        var existing = (await _tickets.ListOpenByServiceAsync(service.Id, ct)).FirstOrDefault(t => t.Category == TicketCategory.Fault);
        if (existing is not null)
        {
            throw new ConflictException(
                "ticket.duplicate_fault",
                $"Fault ticket {existing.Reference} is already open for {service.ServiceReference}; please add a comment to it instead.");
        }
    }

    private Task<TicketDetailDto> AgentMutateAsync<TRequest>(
        string accountNumber, string reference, IValidator<TRequest>? validator, TRequest? request, Action<Ticket, DateTimeOffset> change, CancellationToken ct)
    {
        if (!_currentUser.IsSupportAgent)
        {
            throw new ForbiddenException("This action is only available to support agents.");
        }

        return MutateAsync(accountNumber, reference, AccountPermission.Support, validator, request, change, ct);
    }

    private async Task<TicketDetailDto> MutateAsync<TRequest>(
        string accountNumber,
        string reference,
        AccountPermission permission,
        IValidator<TRequest>? validator,
        TRequest? request,
        Action<Ticket, DateTimeOffset> change,
        CancellationToken ct)
    {
        if (validator is not null)
        {
            await validator.EnsureValidAsync(request!, ct);
        }

        var (_, ticket) = await LoadAsync(accountNumber, reference, permission, ct);
        var now = _clock.UtcNow;
        var before = ticket.Status;
        change(ticket, now);
        await _unitOfWork.SaveChangesAsync(ct);

        if (before != ticket.Status)
        {
            _logger.LogInformation("Ticket {Reference} moved {From} -> {To} by {UserId}", ticket.Reference, before, ticket.Status, _currentUser.UserId);
        }

        return ticket.ToDetailDto(now, _currentUser.IsSupportAgent);
    }

    private async Task<(Domain.Accounts.Account Account, Ticket Ticket)> LoadAsync(
        string accountNumber, string reference, AccountPermission permission, CancellationToken ct)
    {
        var account = await _guard.AuthorizeAsync(accountNumber, permission, ct);
        var ticket = await _tickets.GetByReferenceAsync(reference.Trim().ToUpperInvariant(), ct);
        if (ticket is null || ticket.AccountId != account.Id)
        {
            throw new NotFoundException("Ticket", reference);
        }

        return (account, ticket);
    }
}

/// <summary>Housekeeping: closes resolved tickets after the reopen window and abandoned pending-customer tickets.</summary>
public sealed class TicketHousekeeping
{
    private readonly ITicketRepository _tickets;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly ILogger<TicketHousekeeping> _logger;

    public TicketHousekeeping(ITicketRepository tickets, IUnitOfWork unitOfWork, IClock clock, ILogger<TicketHousekeeping> logger)
    {
        _tickets = tickets;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<int> AutoCloseAsync(CancellationToken ct)
    {
        var now = _clock.UtcNow;
        var horizon = Math.Min(Ticket.ReopenWindowDays, Ticket.PendingCustomerAutoCloseDays);
        var candidates = await _tickets.ListAutoCloseCandidatesAsync(now.AddDays(-horizon), ct);

        var closed = 0;
        foreach (var ticket in candidates.Where(t => t.IsDueForAutoClose(now)))
        {
            ticket.Close(now);
            closed++;
        }

        if (closed > 0)
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }

        _logger.LogInformation("Ticket housekeeping closed {Closed} of {Candidates} candidate tickets", closed, candidates.Count);
        return closed;
    }
}
```

## apps/uconnect/src/Uconnect.Application/Uconnect.Application.csproj

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: xml. Path: `apps/uconnect/src/Uconnect.Application/Uconnect.Application.csproj`.

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <RootNamespace>Uconnect.Application</RootNamespace>
    <Description>Uconnect use cases: profile, services, plan changes, billing, payments, usage, outages, tickets and appointments.</Description>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\Uconnect.Domain\Uconnect.Domain.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="FluentValidation" Version="11.9.2" />
    <PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="11.9.2" />
    <PackageReference Include="Microsoft.Extensions.Logging.Abstractions" Version="8.0.1" />
    <PackageReference Include="Microsoft.Extensions.Options" Version="8.0.2" />
    <PackageReference Include="Microsoft.Extensions.DependencyInjection.Abstractions" Version="8.0.1" />
  </ItemGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="Uconnect.Tests" />
  </ItemGroup>

</Project>
```

## apps/uconnect/src/Uconnect.Application/Usage/UsageService.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Application/Usage/UsageService.cs`.

```csharp
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

            if (!services.TryGetValue(input.ServiceId, out var service))
            {
                service = await _services.GetByIdAsync(input.ServiceId, ct);
                services[input.ServiceId] = service;
            }

            if (service is null || service.ActivatedOn is not { } activated || input.Date < activated)
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
```

## apps/uconnect/src/Uconnect.Domain/Accounts/Account.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Accounts/Account.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Accounts;

/// <summary>
/// The billing entity — a consumer household or a business. Owns contact details, billing
/// preferences and lifecycle status. Services, invoices and tickets reference it by id.
/// </summary>
public sealed class Account : AggregateRoot
{
    public const int MinBillingDay = 1;
    public const int MaxBillingDay = 28;

    /// <summary>The billing day may only be changed once in this many days.</summary>
    public const int BillingDayChangeCooldownDays = 90;

    private Account()
    {
    }

    public Account(
        Guid id,
        AccountNumber number,
        string name,
        AccountType type,
        EmailAddress billingEmail,
        PhoneNumber? phone,
        PostalAddress billingAddress,
        string currency,
        int billingDay,
        DateTimeOffset createdAt)
        : base(id)
    {
        Guard.InRange(billingDay, MinBillingDay, MaxBillingDay, "billing_day");
        Number = number;
        Name = Guard.NotBlank(name, "account.name", 160);
        Type = type;
        BillingEmail = billingEmail;
        Phone = phone;
        BillingAddress = billingAddress;
        Currency = Money.Zero(currency).Currency;
        BillingDay = billingDay;
        Status = AccountStatus.Active;
        PaperlessBilling = true;
        CreatedAt = createdAt;
    }

    public AccountNumber Number { get; private set; } = null!;

    public string Name { get; private set; } = string.Empty;

    public AccountType Type { get; private set; }

    public AccountStatus Status { get; private set; }

    public EmailAddress BillingEmail { get; private set; } = null!;

    public PhoneNumber? Phone { get; private set; }

    public PostalAddress BillingAddress { get; private set; } = null!;

    /// <summary>ISO-4217 currency all charges on the account are billed in.</summary>
    public string Currency { get; private set; } = "GBP";

    /// <summary>Day of month (1..28) on which the monthly billing cycle starts.</summary>
    public int BillingDay { get; private set; }

    public DateTimeOffset? BillingDayChangedAt { get; private set; }

    public bool PaperlessBilling { get; private set; }

    public bool MarketingOptIn { get; private set; }

    public bool OutageSmsAlerts { get; private set; }

    public string? SuspensionReason { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? ClosedAt { get; private set; }

    public bool IsBusiness => Type == AccountType.Business;

    /// <summary>Updates contact details. A billing e-mail change raises an event so a confirmation is sent.</summary>
    public void UpdateContactDetails(string name, EmailAddress billingEmail, PhoneNumber? phone, PostalAddress billingAddress, DateTimeOffset now)
    {
        EnsureNotClosed();
        var previousEmail = BillingEmail;
        Name = Guard.NotBlank(name, "account.name", 160);
        BillingEmail = billingEmail;
        Phone = phone;
        BillingAddress = billingAddress;

        if (previousEmail != billingEmail)
        {
            Raise(new BillingEmailChanged(Id, previousEmail.Value, billingEmail.Value, now));
        }
    }

    public void UpdatePreferences(bool paperlessBilling, bool marketingOptIn, bool outageSmsAlerts)
    {
        EnsureNotClosed();
        if (outageSmsAlerts && Phone is null)
        {
            throw new DomainException("account.sms_requires_phone", "A phone number is required to receive SMS outage alerts.");
        }

        PaperlessBilling = paperlessBilling;
        MarketingOptIn = marketingOptIn;
        OutageSmsAlerts = outageSmsAlerts;
    }

    /// <summary>
    /// Moves the billing day. Limited to once per <see cref="BillingDayChangeCooldownDays"/> days so
    /// customers cannot repeatedly shift cycles to defer payment.
    /// </summary>
    public void ChangeBillingDay(int newBillingDay, DateTimeOffset now)
    {
        EnsureActive();
        Guard.InRange(newBillingDay, MinBillingDay, MaxBillingDay, "billing_day");
        if (newBillingDay == BillingDay)
        {
            return;
        }

        if (BillingDayChangedAt is { } last && (now - last).TotalDays < BillingDayChangeCooldownDays)
        {
            var nextAllowed = last.AddDays(BillingDayChangeCooldownDays);
            throw new DomainException(
                "account.billing_day_cooldown",
                $"The billing day can next be changed on {nextAllowed:yyyy-MM-dd}.");
        }

        BillingDay = newBillingDay;
        BillingDayChangedAt = now;
    }

    public BillingPeriod CurrentBillingPeriod(DateOnly today) => BillingPeriod.Containing(today, BillingDay);

    public void Suspend(string reason, DateTimeOffset now)
    {
        if (Status != AccountStatus.Active)
        {
            throw new InvalidStateTransitionException(nameof(Account), Status.ToString(), AccountStatus.Suspended.ToString());
        }

        SuspensionReason = Guard.NotBlank(reason, "account.suspension_reason");
        Status = AccountStatus.Suspended;
        Raise(new AccountSuspended(Id, SuspensionReason, now));
    }

    public void Reinstate(DateTimeOffset now)
    {
        if (Status != AccountStatus.Suspended)
        {
            throw new InvalidStateTransitionException(nameof(Account), Status.ToString(), AccountStatus.Active.ToString());
        }

        Status = AccountStatus.Active;
        SuspensionReason = null;
        Raise(new AccountReinstated(Id, now));
    }

    /// <summary>Closes the account. Not permitted while a balance is outstanding or services remain live.</summary>
    public void Close(Money outstandingBalance, int liveServiceCount, DateTimeOffset now)
    {
        EnsureNotClosed();
        if (outstandingBalance.IsPositive)
        {
            throw new DomainException("account.outstanding_balance", $"Account has an outstanding balance of {outstandingBalance}.");
        }

        if (liveServiceCount > 0)
        {
            throw new DomainException("account.live_services", "All services must be cancelled before the account is closed.");
        }

        Status = AccountStatus.Closed;
        ClosedAt = now;
    }

    public void EnsureActive()
    {
        if (Status != AccountStatus.Active)
        {
            throw new DomainException("account.not_active", $"Account {Number} is {Status.ToString().ToLowerInvariant()}.");
        }
    }

    private void EnsureNotClosed()
    {
        if (Status == AccountStatus.Closed)
        {
            throw new DomainException("account.closed", $"Account {Number} is closed.");
        }
    }
}

public sealed record BillingEmailChanged(Guid AccountId, string PreviousEmail, string NewEmail, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountSuspended(Guid AccountId, string Reason, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountReinstated(Guid AccountId, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Accounts/AccountUser.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Accounts/AccountUser.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Accounts;

/// <summary>
/// Links an identity-provider subject to an account with a role. Consumer accounts have a single
/// <c>CONSUMER</c> user; business accounts have one or more <c>BUSINESS_ADMIN</c>s who manage
/// <c>BUSINESS_USER</c>s (read-only access to billing and services, may raise tickets).
/// </summary>
public sealed class AccountUser : Entity
{
    private AccountUser()
    {
    }

    public AccountUser(Guid id, Guid accountId, string subjectId, EmailAddress email, string displayName, string role, DateTimeOffset invitedAt)
        : base(id)
    {
        if (role is not (UserRoles.Consumer or UserRoles.BusinessAdmin or UserRoles.BusinessUser))
        {
            throw new DomainException("account_user.invalid_role", $"Role '{role}' cannot be granted on a customer account.");
        }

        AccountId = accountId;
        SubjectId = Guard.NotBlank(subjectId, "account_user.subject", 128);
        Email = email;
        DisplayName = Guard.NotBlank(displayName, "account_user.display_name", 120);
        Role = role;
        InvitedAt = invitedAt;
        IsActive = true;
    }

    public Guid AccountId { get; private set; }

    /// <summary>OIDC <c>sub</c> claim of the user.</summary>
    public string SubjectId { get; private set; } = string.Empty;

    public EmailAddress Email { get; private set; } = null!;

    public string DisplayName { get; private set; } = string.Empty;

    public string Role { get; private set; } = string.Empty;

    public bool IsActive { get; private set; }

    public DateTimeOffset InvitedAt { get; private set; }

    public DateTimeOffset? DeactivatedAt { get; private set; }

    public bool IsAdmin => Role is UserRoles.BusinessAdmin or UserRoles.Consumer;

    internal void ChangeRole(string role) => Role = role;

    internal void Deactivate(DateTimeOffset now)
    {
        IsActive = false;
        DeactivatedAt = now;
    }
}

/// <summary>Rules for managing the users of a business account.</summary>
public static class AccountUserDirectory
{
    public const int MaxUsersPerBusinessAccount = 50;

    public static AccountUser Invite(
        Account account,
        IReadOnlyCollection<AccountUser> existing,
        string subjectId,
        EmailAddress email,
        string displayName,
        string role,
        DateTimeOffset now)
    {
        account.EnsureActive();
        if (!account.IsBusiness)
        {
            throw new DomainException("account_user.consumer_single_user", "Consumer accounts cannot have additional users.");
        }

        if (role == UserRoles.Consumer)
        {
            throw new DomainException("account_user.invalid_role", "Business accounts use BUSINESS_ADMIN or BUSINESS_USER roles.");
        }

        var active = existing.Where(u => u.IsActive).ToList();
        if (active.Count >= MaxUsersPerBusinessAccount)
        {
            throw new DomainException("account_user.limit", $"A business account can have at most {MaxUsersPerBusinessAccount} users.");
        }

        if (active.Any(u => u.Email == email || string.Equals(u.SubjectId, subjectId, StringComparison.Ordinal)))
        {
            throw new DomainException("account_user.duplicate", "This person already has access to the account.");
        }

        return new AccountUser(Guid.NewGuid(), account.Id, subjectId, email, displayName, role, now);
    }

    public static void ChangeRole(IReadOnlyCollection<AccountUser> users, Guid userId, string newRole)
    {
        if (newRole is not (UserRoles.BusinessAdmin or UserRoles.BusinessUser))
        {
            throw new DomainException("account_user.invalid_role", "Business accounts use BUSINESS_ADMIN or BUSINESS_USER roles.");
        }

        var user = FindActive(users, userId);
        if (user.Role == UserRoles.BusinessAdmin && newRole != UserRoles.BusinessAdmin)
        {
            EnsureAnotherAdmin(users, userId);
        }

        user.ChangeRole(newRole);
    }

    public static void Remove(IReadOnlyCollection<AccountUser> users, Guid userId, DateTimeOffset now)
    {
        var user = FindActive(users, userId);
        if (user.Role == UserRoles.BusinessAdmin)
        {
            EnsureAnotherAdmin(users, userId);
        }

        user.Deactivate(now);
    }

    private static AccountUser FindActive(IReadOnlyCollection<AccountUser> users, Guid userId) =>
        users.FirstOrDefault(u => u.Id == userId && u.IsActive)
        ?? throw new DomainException("account_user.not_found", "User not found on this account.");

    private static void EnsureAnotherAdmin(IReadOnlyCollection<AccountUser> users, Guid excludingUserId)
    {
        if (!users.Any(u => u.IsActive && u.Id != excludingUserId && u.Role == UserRoles.BusinessAdmin))
        {
            throw new DomainException("account_user.last_admin", "A business account must keep at least one administrator.");
        }
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Appointments/Appointment.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Appointments/Appointment.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Appointments;

/// <summary>
/// An engineer visit to a service address. Flow: <c>Requested → Confirmed → Completed</c>;
/// a confirmed visit can also end <c>Missed</c> (by the customer or by us) and any open visit can
/// be <c>Cancelled</c>. Customers may reschedule up to <see cref="MaxReschedules"/> times, no later
/// than <see cref="ChangeCutoffHours"/> hours before the window starts.
/// </summary>
public sealed class Appointment : AggregateRoot
{
    public const int MaxReschedules = 3;
    public const int ChangeCutoffHours = 24;

    private Appointment()
    {
    }

    public Appointment(
        Guid id,
        string reference,
        Guid accountId,
        Guid? serviceId,
        Guid? ticketId,
        AppointmentType type,
        AppointmentSlot slot,
        PostalAddress visitAddress,
        string contactName,
        PhoneNumber contactPhone,
        string? accessNotes,
        DateTimeOffset createdAt)
        : base(id)
    {
        if (type == AppointmentType.Repair && ticketId is null)
        {
            throw new DomainException("appointment.repair_needs_ticket", "Repair visits must be linked to a fault ticket.");
        }

        Reference = Guard.NotBlank(reference, "appointment.reference", 20);
        AccountId = accountId;
        ServiceId = serviceId;
        TicketId = ticketId;
        Type = type;
        Date = slot.Date;
        Window = slot.Window;
        VisitAddress = visitAddress;
        ContactName = Guard.NotBlank(contactName, "appointment.contact_name", 120);
        ContactPhone = contactPhone;
        AccessNotes = NormaliseNotes(accessNotes);
        Status = AppointmentStatus.Requested;
        CreatedAt = createdAt;
    }

    public string Reference { get; private set; } = string.Empty;

    public Guid AccountId { get; private set; }

    public Guid? ServiceId { get; private set; }

    public Guid? TicketId { get; private set; }

    public AppointmentType Type { get; private set; }

    public DateOnly Date { get; private set; }

    public AppointmentWindow Window { get; private set; }

    public PostalAddress VisitAddress { get; private set; } = null!;

    public string ContactName { get; private set; } = string.Empty;

    public PhoneNumber ContactPhone { get; private set; } = null!;

    public string? AccessNotes { get; private set; }

    public AppointmentStatus Status { get; private set; }

    public string? EngineerName { get; private set; }

    public string? FieldWorkOrderRef { get; private set; }

    public int RescheduleCount { get; private set; }

    public bool LateCancellation { get; private set; }

    public string? CancellationReason { get; private set; }

    /// <summary>True when the visit was missed because the engineer did not attend.</summary>
    public bool MissedByProvider { get; private set; }

    public string? OutcomeNotes { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public AppointmentSlot Slot => new(Date, Window);

    public bool IsActive => Status is AppointmentStatus.Requested or AppointmentStatus.Confirmed;

    /// <summary>Whether the customer may still change or cancel without it counting as late.</summary>
    public bool IsChangeable(DateTimeOffset now) =>
        IsActive && Slot.StartsAtUtc - now >= TimeSpan.FromHours(ChangeCutoffHours);

    public void Confirm(string fieldWorkOrderRef, string? engineerName)
    {
        if (Status != AppointmentStatus.Requested)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Confirmed.ToString());
        }

        FieldWorkOrderRef = Guard.NotBlank(fieldWorkOrderRef, "appointment.work_order", 40);
        EngineerName = string.IsNullOrWhiteSpace(engineerName) ? null : engineerName.Trim();
        Status = AppointmentStatus.Confirmed;
    }

    public void Reschedule(AppointmentSlot newSlot, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new DomainException("appointment.not_active", "Only upcoming appointments can be rescheduled.");
        }

        if (!IsChangeable(now))
        {
            throw new DomainException("appointment.too_late_to_change", $"Appointments cannot be changed within {ChangeCutoffHours} hours of the visit; please contact support.");
        }

        if (RescheduleCount >= MaxReschedules)
        {
            throw new DomainException("appointment.reschedule_limit", $"An appointment can be rescheduled at most {MaxReschedules} times.");
        }

        if (newSlot == Slot)
        {
            throw new DomainException("appointment.same_slot", "The new slot is the same as the current one.");
        }

        var previous = Slot;
        Date = newSlot.Date;
        Window = newSlot.Window;
        RescheduleCount++;

        // The field system re-plans the visit, so it returns to Requested until reconfirmed.
        Status = AppointmentStatus.Requested;
        EngineerName = null;
        Raise(new AppointmentRescheduled(Id, AccountId, Reference, previous, newSlot, now));
    }

    public void UpdateAccessNotes(string? notes, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new DomainException("appointment.not_active", "Notes can only be changed on upcoming appointments.");
        }

        AccessNotes = NormaliseNotes(notes);
    }

    public void Cancel(string reason, DateTimeOffset now)
    {
        if (!IsActive)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Cancelled.ToString());
        }

        if (now >= Slot.StartsAtUtc)
        {
            throw new DomainException("appointment.already_started", "The appointment window has already started.");
        }

        LateCancellation = !IsChangeable(now);
        CancellationReason = Guard.NotBlank(reason, "appointment.cancellation_reason", 500);
        Status = AppointmentStatus.Cancelled;
        Raise(new AppointmentCancelled(Id, AccountId, Reference, LateCancellation, now));
    }

    public void Complete(string outcomeNotes, DateTimeOffset now)
    {
        if (Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Completed.ToString());
        }

        if (now < Slot.StartsAtUtc)
        {
            throw new DomainException("appointment.not_started", "An appointment cannot be completed before its window starts.");
        }

        OutcomeNotes = Guard.NotBlank(outcomeNotes, "appointment.outcome", 2000);
        Status = AppointmentStatus.Completed;
        CompletedAt = now;
    }

    public void MarkMissed(bool missedByProvider, string notes, DateTimeOffset now)
    {
        if (Status != AppointmentStatus.Confirmed)
        {
            throw new InvalidStateTransitionException(nameof(Appointment), Status.ToString(), AppointmentStatus.Missed.ToString());
        }

        if (now < Slot.EndsAtUtc)
        {
            throw new DomainException("appointment.window_open", "An appointment can only be marked missed after its window has ended.");
        }

        MissedByProvider = missedByProvider;
        OutcomeNotes = Guard.NotBlank(notes, "appointment.outcome", 2000);
        Status = AppointmentStatus.Missed;
        Raise(new AppointmentMissed(Id, AccountId, ServiceId, Reference, missedByProvider, now));
    }

    private static string? NormaliseNotes(string? notes)
    {
        if (string.IsNullOrWhiteSpace(notes))
        {
            return null;
        }

        var trimmed = notes.Trim();
        return trimmed.Length > 500
            ? throw new DomainException("appointment.notes_too_long", "Access notes must be at most 500 characters.")
            : trimmed;
    }
}

public sealed record AppointmentRescheduled(Guid AppointmentId, Guid AccountId, string Reference, AppointmentSlot From, AppointmentSlot To, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AppointmentCancelled(Guid AppointmentId, Guid AccountId, string Reference, bool Late, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AppointmentMissed(Guid AppointmentId, Guid AccountId, Guid? ServiceId, string Reference, bool MissedByProvider, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Appointments/AppointmentSlot.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Appointments/AppointmentSlot.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Appointments;

/// <summary>
/// A bookable visit window on a date. Windows are defined in UK local time
/// (morning 08:00–13:00, afternoon 12:00–18:00, all day 08:00–18:00) and exposed as UTC instants.
/// </summary>
public sealed record AppointmentSlot(DateOnly Date, AppointmentWindow Window)
{
    private static readonly TimeZoneInfo UkTimeZone = ResolveUkTimeZone();

    public TimeOnly LocalStart => Window switch
    {
        AppointmentWindow.Afternoon => new TimeOnly(12, 0),
        _ => new TimeOnly(8, 0),
    };

    public TimeOnly LocalEnd => Window switch
    {
        AppointmentWindow.Morning => new TimeOnly(13, 0),
        _ => new TimeOnly(18, 0),
    };

    public DateTimeOffset StartsAtUtc => ToUtc(LocalStart);

    public DateTimeOffset EndsAtUtc => ToUtc(LocalEnd);

    public override string ToString() => $"{Date:yyyy-MM-dd} {Window}";

    private DateTimeOffset ToUtc(TimeOnly localTime)
    {
        var local = DateTime.SpecifyKind(Date.ToDateTime(localTime), DateTimeKind.Unspecified);
        var utc = TimeZoneInfo.ConvertTimeToUtc(local, UkTimeZone);
        return new DateTimeOffset(utc, TimeSpan.Zero);
    }

    private static TimeZoneInfo ResolveUkTimeZone()
    {
        foreach (var id in new[] { "Europe/London", "GMT Standard Time" })
        {
            if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone))
            {
                return zone;
            }
        }

        return TimeZoneInfo.Utc;
    }
}

/// <summary>A slot with the remaining field-engineer capacity for the visit's area.</summary>
public sealed record AvailableSlot(AppointmentSlot Slot, int RemainingCapacity);

/// <summary>
/// Booking rules for engineer visits:
/// <list type="bullet">
/// <item>Lead time depends on visit type: repairs from the next working day, upgrades and surveys
/// after two working days, installations after five.</item>
/// <item>Visits are offered up to <see cref="BookingHorizonDays"/> days ahead, never on Sundays or
/// public holidays; Saturdays offer the morning window only.</item>
/// <item>All-day windows are offered only for installations, which may need civil works.</item>
/// </list>
/// </summary>
public static class AppointmentSchedulingPolicy
{
    public const int BookingHorizonDays = 30;

    public static int LeadTimeWorkingDays(AppointmentType type) => type switch
    {
        AppointmentType.Repair => 1,
        AppointmentType.Upgrade => 2,
        AppointmentType.Survey => 2,
        AppointmentType.Installation => 5,
        _ => 2,
    };

    public static bool IsWorkingDay(DateOnly date, IReadOnlySet<DateOnly> holidays) =>
        date.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday) && !holidays.Contains(date);

    public static DateOnly EarliestBookableDate(AppointmentType type, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        var date = today;
        var remaining = LeadTimeWorkingDays(type);
        while (remaining > 0)
        {
            date = date.AddDays(1);
            if (IsWorkingDay(date, holidays))
            {
                remaining--;
            }
        }

        return date;
    }

    public static IEnumerable<AppointmentWindow> WindowsOffered(AppointmentType type, DateOnly date, IReadOnlySet<DateOnly> holidays)
    {
        if (date.DayOfWeek == DayOfWeek.Sunday || holidays.Contains(date))
        {
            yield break;
        }

        yield return AppointmentWindow.Morning;
        if (date.DayOfWeek == DayOfWeek.Saturday)
        {
            yield break;
        }

        yield return AppointmentWindow.Afternoon;
        if (type == AppointmentType.Installation)
        {
            yield return AppointmentWindow.AllDay;
        }
    }

    /// <summary>All candidate slots for <paramref name="type"/> from the earliest date to the booking horizon.</summary>
    public static IReadOnlyList<AppointmentSlot> CandidateSlots(AppointmentType type, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        var slots = new List<AppointmentSlot>();
        var earliest = EarliestBookableDate(type, today, holidays);
        var horizon = today.AddDays(BookingHorizonDays);
        for (var date = earliest; date <= horizon; date = date.AddDays(1))
        {
            slots.AddRange(WindowsOffered(type, date, holidays).Select(w => new AppointmentSlot(date, w)));
        }

        return slots;
    }

    /// <summary>Validates that a requested slot obeys the booking rules (capacity is checked separately).</summary>
    public static void EnsureBookable(AppointmentType type, AppointmentSlot slot, DateOnly today, IReadOnlySet<DateOnly> holidays)
    {
        if (slot.Date < EarliestBookableDate(type, today, holidays))
        {
            throw new DomainException("appointment.too_soon", $"The earliest date for a {type.ToString().ToLowerInvariant()} visit is {EarliestBookableDate(type, today, holidays):yyyy-MM-dd}.");
        }

        if (slot.Date > today.AddDays(BookingHorizonDays))
        {
            throw new DomainException("appointment.too_far", $"Visits can be booked at most {BookingHorizonDays} days ahead.");
        }

        if (!WindowsOffered(type, slot.Date, holidays).Contains(slot.Window))
        {
            throw new DomainException("appointment.window_unavailable", $"The {slot.Window} window is not offered on {slot.Date:dddd d MMMM}.");
        }
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Billing/AccountAdjustment.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Billing/AccountAdjustment.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

public enum AdjustmentReason
{
    Goodwill = 1,
    OutageCompensation = 2,
    MissedAppointmentCompensation = 3,
    EngineerCallOutFee = 4,
    LatePaymentFee = 5,
    BillingCorrection = 6,
}

/// <summary>
/// A one-off charge or credit raised against an account outside the recurring cycle (outage
/// compensation, goodwill gesture, call-out fee...). It waits until the next invoice is built,
/// at which point it is billed exactly once.
/// </summary>
public sealed class AccountAdjustment : AggregateRoot
{
    /// <summary>Largest goodwill credit an agent may raise without a team-lead approval reference.</summary>
    public static readonly long AgentGoodwillLimitMinor = 50_00;

    private AccountAdjustment()
    {
    }

    public AccountAdjustment(
        Guid id,
        Guid accountId,
        Guid? serviceId,
        AdjustmentReason reason,
        string description,
        Money amount,
        Guid raisedByUserId,
        DateTimeOffset raisedAt,
        string? approvalReference = null,
        string? sourceReference = null)
        : base(id)
    {
        if (amount.IsZero)
        {
            throw new DomainException("adjustment.zero", "Adjustment amount must not be zero.");
        }

        var isCredit = reason is AdjustmentReason.Goodwill or AdjustmentReason.OutageCompensation
            or AdjustmentReason.MissedAppointmentCompensation;
        if (isCredit && amount.IsPositive)
        {
            throw new DomainException("adjustment.credit_sign", "Compensation and goodwill adjustments must be credits (negative).");
        }

        if (!isCredit && reason != AdjustmentReason.BillingCorrection && amount.IsNegative)
        {
            throw new DomainException("adjustment.charge_sign", "Fees must be charges (positive).");
        }

        if (reason == AdjustmentReason.Goodwill && amount.Abs().AmountMinor > AgentGoodwillLimitMinor && string.IsNullOrWhiteSpace(approvalReference))
        {
            throw new DomainException("adjustment.approval_required", "Goodwill credits above the agent limit need an approval reference.");
        }

        AccountId = accountId;
        ServiceId = serviceId;
        Reason = reason;
        Description = Guard.NotBlank(description, "adjustment.description", 200);
        Amount = amount;
        RaisedByUserId = raisedByUserId;
        RaisedAt = raisedAt;
        ApprovalReference = approvalReference;
        SourceReference = sourceReference;
    }

    public Guid AccountId { get; private set; }

    public Guid? ServiceId { get; private set; }

    public AdjustmentReason Reason { get; private set; }

    public string Description { get; private set; } = string.Empty;

    /// <summary>Signed amount: negative for credits, positive for charges.</summary>
    public Money Amount { get; private set; } = null!;

    public Guid RaisedByUserId { get; private set; }

    public DateTimeOffset RaisedAt { get; private set; }

    public string? ApprovalReference { get; private set; }

    /// <summary>What triggered the adjustment (outage or appointment reference); used to prevent duplicate compensation.</summary>
    public string? SourceReference { get; private set; }

    public Guid? BilledOnInvoiceId { get; private set; }

    public bool IsBilled => BilledOnInvoiceId is not null;

    /// <summary>Fees are subject to VAT; compensation credits reduce the VAT-able total as well.</summary>
    public bool Taxable => Reason != AdjustmentReason.LatePaymentFee;

    public InvoiceLineType LineType => Amount.IsNegative ? InvoiceLineType.Credit : InvoiceLineType.OneOff;

    public void MarkBilled(Guid invoiceId)
    {
        if (IsBilled)
        {
            throw new DomainException("adjustment.already_billed", "This adjustment has already been billed.");
        }

        BilledOnInvoiceId = invoiceId;
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Billing/Invoice.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Billing/Invoice.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

/// <summary>
/// A monthly bill. Built as a <see cref="InvoiceStatus.Draft"/>, totals are recalculated on every
/// line change, and once issued the lines are frozen. Payments move it through
/// <c>Issued → PartiallyPaid → Paid</c>; an unpaid invoice past its due date becomes <c>Overdue</c>.
/// An invoice whose total is negative (credits exceed charges) is settled on issue and the surplus is
/// carried forward as a credit to the next invoice.
/// </summary>
public sealed class Invoice : AggregateRoot
{
    private readonly List<InvoiceLine> _lines = new();

    private Invoice()
    {
    }

    public Invoice(Guid id, string invoiceNumber, Guid accountId, BillingPeriod period, string currency, DateTimeOffset createdAt)
        : base(id)
    {
        InvoiceNumber = Guard.NotBlank(invoiceNumber, "invoice.number", 32);
        AccountId = accountId;
        PeriodStart = period.Start;
        PeriodEnd = period.End;
        Currency = Money.Zero(currency).Currency;
        Status = InvoiceStatus.Draft;
        CreatedAt = createdAt;
        Subtotal = Money.Zero(Currency);
        TaxTotal = Money.Zero(Currency);
        Total = Money.Zero(Currency);
        AmountPaid = Money.Zero(Currency);
        CreditCarriedForward = Money.Zero(Currency);
    }

    /// <summary>Customer-visible number, e.g. <c>INV-202611-000123</c>.</summary>
    public string InvoiceNumber { get; private set; } = string.Empty;

    public Guid AccountId { get; private set; }

    public DateOnly PeriodStart { get; private set; }

    public DateOnly PeriodEnd { get; private set; }

    public BillingPeriod Period => new(PeriodStart, PeriodEnd);

    public string Currency { get; private set; } = "GBP";

    public InvoiceStatus Status { get; private set; }

    public IReadOnlyList<InvoiceLine> Lines => _lines.AsReadOnly();

    public Money Subtotal { get; private set; } = null!;

    public Money TaxTotal { get; private set; } = null!;

    public Money Total { get; private set; } = null!;

    public Money AmountPaid { get; private set; } = null!;

    /// <summary>Credit (positive amount) to be applied to the next invoice when this one totals below zero.</summary>
    public Money CreditCarriedForward { get; private set; } = null!;

    /// <summary>Tax rate applied at issue, in basis points.</summary>
    public int TaxRateBasisPoints { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateOnly? IssuedOn { get; private set; }

    public DateOnly? DueOn { get; private set; }

    public DateTimeOffset? PaidAt { get; private set; }

    public string? VoidReason { get; private set; }

    public Money BalanceDue => Total.IsNegative ? Money.Zero(Currency) : Total - AmountPaid;

    public bool IsPayable => Status is InvoiceStatus.Issued or InvoiceStatus.PartiallyPaid or InvoiceStatus.Overdue;

    public InvoiceLine AddLine(
        InvoiceLineType type,
        string description,
        Money unitAmount,
        int quantity = 1,
        Guid? serviceId = null,
        bool taxable = true,
        DateOnly? servicePeriodStart = null,
        DateOnly? servicePeriodEnd = null)
    {
        EnsureDraft();
        if (unitAmount.Currency != Currency)
        {
            throw new DomainException("invoice.currency_mismatch", $"Line currency {unitAmount.Currency} differs from invoice currency {Currency}.");
        }

        if (quantity <= 0)
        {
            throw new DomainException("invoice.line_quantity", "Line quantity must be positive.");
        }

        var expectsCredit = type is InvoiceLineType.Credit or InvoiceLineType.Discount;
        if (expectsCredit && unitAmount.IsPositive)
        {
            throw new DomainException("invoice.credit_sign", "Credit and discount lines must have a negative amount.");
        }

        var line = new InvoiceLine(
            Guid.NewGuid(), Id, type, description, unitAmount, quantity, serviceId, taxable, servicePeriodStart, servicePeriodEnd);
        _lines.Add(line);
        Recalculate();
        return line;
    }

    public void RemoveLine(Guid lineId)
    {
        EnsureDraft();
        var line = _lines.FirstOrDefault(l => l.Id == lineId)
            ?? throw new DomainException("invoice.line_not_found", "Invoice line not found.");
        _lines.Remove(line);
        Recalculate();
    }

    /// <summary>Applies tax, freezes the invoice and sets the due date.</summary>
    public void Issue(DateOnly issuedOn, int paymentTermsDays, int taxRateBasisPoints, DateTimeOffset now)
    {
        EnsureDraft();
        if (_lines.Count == 0)
        {
            throw new DomainException("invoice.empty", "An invoice must have at least one line before it is issued.");
        }

        Guard.InRange(paymentTermsDays, 0, 60, "invoice.payment_terms");
        Guard.InRange(taxRateBasisPoints, 0, 10_000, "invoice.tax_rate");

        TaxRateBasisPoints = taxRateBasisPoints;
        Recalculate();
        IssuedOn = issuedOn;
        DueOn = issuedOn.AddDays(paymentTermsDays);

        if (Total.IsPositive)
        {
            Status = InvoiceStatus.Issued;
        }
        else
        {
            Status = InvoiceStatus.Paid;
            PaidAt = now;
            CreditCarriedForward = Total.Negate();
        }

        Raise(new InvoiceIssued(Id, AccountId, InvoiceNumber, Total, DueOn.Value, now));
    }

    /// <summary>Records a settled payment against the invoice. Overpayment is rejected.</summary>
    public void ApplyPayment(Money amount, DateTimeOffset paidAt)
    {
        if (!IsPayable)
        {
            throw new DomainException("invoice.not_payable", $"Invoice {InvoiceNumber} is {Status.ToString().ToLowerInvariant()} and cannot be paid.");
        }

        Guard.Positive(amount, "payment.amount");
        if (amount > BalanceDue)
        {
            throw new DomainException("invoice.overpayment", $"Payment of {amount} exceeds the balance due of {BalanceDue}.");
        }

        AmountPaid += amount;
        if (BalanceDue.IsZero)
        {
            Status = InvoiceStatus.Paid;
            PaidAt = paidAt;
            Raise(new InvoicePaid(Id, AccountId, InvoiceNumber, paidAt));
        }
        else if (Status != InvoiceStatus.Overdue)
        {
            Status = InvoiceStatus.PartiallyPaid;
        }
    }

    /// <summary>Reverses part of a previously applied payment, e.g. after a refund or chargeback.</summary>
    public void ReversePayment(Money amount, DateOnly today)
    {
        Guard.Positive(amount, "refund.amount");
        if (amount > AmountPaid)
        {
            throw new DomainException("invoice.reversal_exceeds_paid", "Cannot reverse more than has been paid.");
        }

        if (Status is InvoiceStatus.Draft or InvoiceStatus.Void)
        {
            throw new DomainException("invoice.not_reversible", "Payments cannot be reversed on a draft or void invoice.");
        }

        AmountPaid -= amount;
        PaidAt = null;
        if (DueOn is { } due && today > due)
        {
            Status = InvoiceStatus.Overdue;
        }
        else
        {
            Status = AmountPaid.IsZero ? InvoiceStatus.Issued : InvoiceStatus.PartiallyPaid;
        }
    }

    /// <summary>Flags the invoice as overdue when unpaid after its due date. Returns true if the status changed.</summary>
    public bool MarkOverdueIfLate(DateOnly today)
    {
        if (Status is not (InvoiceStatus.Issued or InvoiceStatus.PartiallyPaid) || DueOn is not { } due || today <= due)
        {
            return false;
        }

        Status = InvoiceStatus.Overdue;
        Raise(new InvoiceOverdue(Id, AccountId, InvoiceNumber, BalanceDue, new DateTimeOffset(today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)));
        return true;
    }

    public void Void(string reason)
    {
        if (Status is not (InvoiceStatus.Draft or InvoiceStatus.Issued))
        {
            throw new InvalidStateTransitionException(nameof(Invoice), Status.ToString(), InvoiceStatus.Void.ToString());
        }

        if (AmountPaid.IsPositive)
        {
            throw new DomainException("invoice.has_payments", "Refund payments before voiding the invoice.");
        }

        VoidReason = Guard.NotBlank(reason, "invoice.void_reason");
        Status = InvoiceStatus.Void;
    }

    public int DaysOverdue(DateOnly today) =>
        Status == InvoiceStatus.Overdue && DueOn is { } due ? Math.Max(0, today.DayNumber - due.DayNumber) : 0;

    private void Recalculate()
    {
        Subtotal = _lines.Select(l => l.Amount).Sum(Currency);
        var taxableBase = _lines.Where(l => l.Taxable).Select(l => l.Amount).Sum(Currency);
        TaxTotal = TaxCalculator.Calculate(taxableBase, TaxRateBasisPoints);
        Total = Subtotal + TaxTotal;
    }

    private void EnsureDraft()
    {
        if (Status != InvoiceStatus.Draft)
        {
            throw new DomainException("invoice.not_draft", $"Invoice {InvoiceNumber} has been issued and can no longer be changed.");
        }
    }
}

public sealed record InvoiceIssued(Guid InvoiceId, Guid AccountId, string InvoiceNumber, Money Total, DateOnly DueOn, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record InvoicePaid(Guid InvoiceId, Guid AccountId, string InvoiceNumber, DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record InvoiceOverdue(Guid InvoiceId, Guid AccountId, string InvoiceNumber, Money BalanceDue, DateTimeOffset OccurredAt) : IDomainEvent;
```

## apps/uconnect/src/Uconnect.Domain/Billing/InvoiceBuilder.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Billing/InvoiceBuilder.cs`.

```csharp
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Usage;

namespace Uconnect.Domain.Billing;

/// <summary>Everything the builder needs to produce one account's invoice for one period.</summary>
public sealed record InvoiceInputs(
    Account Account,
    BillingPeriod Period,
    IReadOnlyList<(Service Service, Plan Plan)> Services,
    IReadOnlyList<PlanChange> UnbilledPlanChanges,
    IReadOnlyList<UsageCharge> UsageCharges,
    IReadOnlyList<AccountAdjustment> Adjustments,
    Money CreditBroughtForward);

/// <summary>
/// Assembles a draft invoice. Recurring charges are billed in advance for <see cref="InvoiceInputs.Period"/>
/// and prorated when a service activates or is cancelled part-way through it; plan-change proration
/// and fees, usage overage from the previous period and unbilled account adjustments are billed in arrears.
/// </summary>
public static class InvoiceBuilder
{
    public static Invoice Build(Guid invoiceId, string invoiceNumber, InvoiceInputs inputs, DateTimeOffset now)
    {
        var account = inputs.Account;
        var period = inputs.Period;
        var invoice = new Invoice(invoiceId, invoiceNumber, account.Id, period, account.Currency, now);

        foreach (var (service, plan) in inputs.Services.OrderBy(s => s.Service.ServiceReference, StringComparer.Ordinal))
        {
            AddRecurringCharge(invoice, period, service, plan);
        }

        foreach (var change in inputs.UnbilledPlanChanges.Where(c => c.Status == PlanChangeStatus.Completed && c.BilledOnInvoiceId is null))
        {
            AddPlanChangeLines(invoice, change);
        }

        foreach (var usage in inputs.UsageCharges.Where(u => u.Amount.IsPositive))
        {
            invoice.AddLine(
                InvoiceLineType.Usage,
                $"Usage above {usage.AllowanceGb} GB fair-use allowance ({usage.ExcessGb} GB)",
                usage.RatePerGb,
                usage.ExcessGb,
                usage.ServiceId,
                taxable: true,
                usage.Period.Start,
                usage.Period.End);
        }

        foreach (var adjustment in inputs.Adjustments.Where(a => !a.IsBilled).OrderBy(a => a.RaisedAt))
        {
            invoice.AddLine(adjustment.LineType, adjustment.Description, adjustment.Amount, 1, adjustment.ServiceId, adjustment.Taxable);
        }

        if (inputs.CreditBroughtForward.IsPositive)
        {
            // Carried-forward credit already included tax when it arose, so it is applied untaxed.
            invoice.AddLine(InvoiceLineType.Credit, "Credit brought forward from previous invoice", inputs.CreditBroughtForward.Negate(), taxable: false);
        }

        return invoice;
    }

    private static void AddRecurringCharge(Invoice invoice, BillingPeriod period, Service service, Plan plan)
    {
        if (service.ActivatedOn is not { } activatedOn || activatedOn >= period.End)
        {
            return;
        }

        var until = service.CancelledOn ?? period.End;
        if (until <= period.Start)
        {
            return;
        }

        var amount = ProrationCalculator.PartialPeriodCharge(period, activatedOn, until, service.MonthlyPrice);
        if (amount.IsZero)
        {
            return;
        }

        var from = activatedOn > period.Start ? activatedOn : period.Start;
        var to = until < period.End ? until : period.End;
        var partial = from != period.Start || to != period.End;
        var description = partial
            ? $"{plan.Name} ({service.ServiceReference}) {from:dd MMM} – {to.AddDays(-1):dd MMM}, part period"
            : $"{plan.Name} ({service.ServiceReference}) monthly charge";

        invoice.AddLine(InvoiceLineType.Recurring, description, amount, 1, service.Id, taxable: true, from, to);
    }

    private static void AddPlanChangeLines(Invoice invoice, PlanChange change)
    {
        if (!change.ProrationCredit.IsZero)
        {
            invoice.AddLine(
                InvoiceLineType.Credit,
                $"Credit for {change.ProrationDays} unused days on previous plan",
                change.ProrationCredit.Negate(),
                1,
                change.ServiceId);
        }

        if (!change.ProrationCharge.IsZero)
        {
            invoice.AddLine(
                InvoiceLineType.Proration,
                $"Charge for {change.ProrationDays} days on new plan from {change.EffectiveOn:dd MMM yyyy}",
                change.ProrationCharge,
                1,
                change.ServiceId);
        }

        if (change.EarlyTerminationFee.IsPositive)
        {
            invoice.AddLine(
                InvoiceLineType.EarlyTerminationFee,
                "Early plan change fee (within minimum term)",
                change.EarlyTerminationFee,
                1,
                change.ServiceId,
                taxable: true);
        }
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Billing/InvoiceLine.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Billing/InvoiceLine.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Billing;

/// <summary>A single charge or credit on an invoice. Amount = unit amount × quantity.</summary>
public sealed class InvoiceLine : Entity
{
    private InvoiceLine()
    {
    }

    internal InvoiceLine(
        Guid id,
        Guid invoiceId,
        InvoiceLineType type,
        string description,
        Money unitAmount,
        int quantity,
        Guid? serviceId,
        bool taxable,
        DateOnly? servicePeriodStart,
        DateOnly? servicePeriodEnd)
        : base(id)
    {
        if (servicePeriodStart is not null && servicePeriodEnd is not null && servicePeriodEnd <= servicePeriodStart)
        {
            throw new DomainException("invoice.line_period", "Line service period end must be after its start.");
        }

        InvoiceId = invoiceId;
        Type = type;
        Description = Guard.NotBlank(description, "invoice.line_description", 200);
        UnitAmount = unitAmount;
        Quantity = quantity;
        Amount = unitAmount.Multiply(quantity);
        ServiceId = serviceId;
        Taxable = taxable;
        ServicePeriodStart = servicePeriodStart;
        ServicePeriodEnd = servicePeriodEnd;
    }

    public Guid InvoiceId { get; private set; }

    public InvoiceLineType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public Money UnitAmount { get; private set; } = null!;

    public int Quantity { get; private set; }

    public Money Amount { get; private set; } = null!;

    public Guid? ServiceId { get; private set; }

    public bool Taxable { get; private set; }

    public DateOnly? ServicePeriodStart { get; private set; }

    public DateOnly? ServicePeriodEnd { get; private set; }
}

/// <summary>
/// Computes tax on a taxable base at a basis-point rate. Tax is calculated once on the invoice
/// total (not per line) to avoid accumulated rounding differences; a negative base (net credit)
/// produces negative tax so a credit note refunds the tax originally charged.
/// </summary>
public static class TaxCalculator
{
    /// <summary>UK standard VAT rate (20%).</summary>
    public const int UkStandardVatBasisPoints = 2000;

    public static Money Calculate(Money taxableBase, int rateBasisPoints)
    {
        if (rateBasisPoints < 0)
        {
            throw new DomainException("tax.invalid_rate", "Tax rate must not be negative.");
        }

        return taxableBase.ApplyBasisPoints(rateBasisPoints);
    }

    /// <summary>Splits a tax-inclusive gross amount into net and tax components.</summary>
    public static (Money Net, Money Tax) SplitGross(Money gross, int rateBasisPoints)
    {
        var net = gross.MultiplyRatio(10_000, 10_000 + rateBasisPoints);
        return (net, gross - net);
    }
}
```

## apps/uconnect/src/Uconnect.Domain/Catalog/Plan.cs

Application: Uconnect account & service management. Stack: .NET 8 (ASP.NET Core Web API, EF Core, Razor Pages). Language: csharp. Path: `apps/uconnect/src/Uconnect.Domain/Catalog/Plan.cs`.

```csharp
using Uconnect.Domain.Common;

namespace Uconnect.Domain.Catalog;

/// <summary>
/// A sellable product tier, e.g. "Fibre 500". Plans of the same <see cref="ProductType"/> are
/// ranked by <see cref="Tier"/>, which defines whether a change is an upgrade or a downgrade.
/// </summary>
public sealed class Plan : AggregateRoot
{
    private Plan()
    {
    }

    public Plan(
        Guid id,
        string code,
        string name,
        ProductType productType,
        int tier,
        Money monthlyPrice,
        int downloadMbps,
        int uploadMbps,
        int minimumTermMonths,
        Money setupFee,
        bool availableToConsumers,
        bool availableToBusinesses)
        : base(id)
    {
        Code = Guard.NotBlank(code, "plan.code", 40).ToUpperInvariant();
        Name = Guard.NotBlank(name, "plan.name", 120);
        ProductType = productType;
        Guard.InRange(tier, 1, 100, "plan.tier");
        Tier = tier;
        Guard.NotNegative(monthlyPrice, "plan.monthly_price");
        Guard.NotNegative(setupFee, "plan.setup_fee");
        MonthlyPrice = monthlyPrice;
        SetupFee = setupFee;
        DownloadMbps = downloadMbps;
        UploadMbps = uploadMbps;
        Guard.InRange(minimumTermMonths, 0, 36, "plan.minimum_term");
        MinimumTermMonths = minimumTermMonths;
        AvailableToConsumers = availableToConsumers;
        AvailableToBusinesses = availableToBusinesses;
        IsActive = true;
    }

    /// <summary>Stable catalog code, e.g. <c>FIBRE-500</c>.</summary>
    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public ProductType ProductType { get; private set; }

    /// <summary>Rank within the product type; higher is better.</summary>
    public int Tier { get; private set; }

    public Money MonthlyPrice { get; private set; } = null!;

    public Money SetupFee { get; private set; } = null!;

    public int DownloadMbps { get; private set; }

    public int UploadMbps { get; private set; }

    public int MinimumTermMonths { get; private set; }

    /// <summary>
    /// Monthly fair-use threshold in gigabytes; <c>null</c> means unlimited. Exceeding it never
    /// blocks service but triggers notifications and may attract usage charges on business plans.
    /// </summary>
    public int? FairUseAllowanceGb { get; private set; }

    /// <summary>Per-GB overage charge applied beyond the allowance (business plans only).</summary>
    public Money? OveragePerGb { get; private set; }

    public bool AvailableToConsumers { get; private set; }

    public bool AvailableToBusinesses { get; private set; }

    public bool IsActive { get; private set; }

    public bool IsAvailableTo(AccountType accountType) =>
        IsActive && (accountType == AccountType.Business ? AvailableToBusinesses : AvailableToConsumers);

    public void ConfigureFairUse(int? allowanceGb, Money? overagePerGb)
    {
        if (allowanceGb is <= 0)
        {
            throw new DomainException("plan.allowance_invalid", "Fair-use allowance must be positive when set.");
        }

        if (overagePerGb is not null && allowanceGb is null)
        {
            throw new DomainException("plan.overage_without_allowance", "An overage rate requires an allowance.");
        }

        if (overagePerGb is not null)
        {
            Guard.NotNegative(overagePerGb, "plan.overage_per_gb");
        }

        FairUseAllowanceGb = allowanceGb;
        OveragePerGb = overagePerGb;
    }

    public void Reprice(Money newMonthlyPrice)
    {
        Guard.NotNegative(newMonthlyPrice, "plan.monthly_price");
        if (newMonthlyPrice.Currency != MonthlyPrice.Currency)
        {
            throw new DomainException("plan.currency_change", "A plan's currency cannot be changed.");
        }

        MonthlyPrice = newMonthlyPrice;
    }

    public void Retire() => IsActive = false;

    /// <summary>Classifies a move from this plan to <paramref name="target"/>.</summary>
    public PlanChangeType ClassifyChangeTo(Plan target)
    {
        if (target.ProductType != ProductType)
        {
            throw new DomainException("plan_change.product_mismatch", "Plans must be of the same product type.");
        }

        if (target.Id == Id)
        {
            throw new DomainException("plan_change.same_plan", "The service is already on this plan.");
        }

        if (target.Tier > Tier)
        {
            return PlanChangeType.Upgrade;
        }

        return target.Tier < Tier ? PlanChangeType.Downgrade : PlanChangeType.Lateral;
    }
}
```

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

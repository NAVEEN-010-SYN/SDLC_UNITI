using FluentValidation;
using Microsoft.Extensions.Logging;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Services;

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
        var ordered = outages
            .OrderBy(o => o.IsResolved)
            .ThenByDescending(o => o.Severity)
            .ThenByDescending(o => o.StartedAt);

        var result = new List<AccountOutageDto>();
        foreach (var outage in ordered)
        {
            var affected = AffectedServiceReferences(outage, services);
            if (affected.Count > 0)
            {
                result.Add(new AccountOutageDto(outage.ToDto(), affected));
            }
        }

        return result;
    }

    private static List<string> AffectedServiceReferences(Outage outage, IEnumerable<Service> services)
    {
        var references = new List<string>();
        foreach (var service in services)
        {
            if (outage.Affects(service.ServiceAddress))
            {
                references.Add(service.ServiceReference);
            }
        }

        return references;
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

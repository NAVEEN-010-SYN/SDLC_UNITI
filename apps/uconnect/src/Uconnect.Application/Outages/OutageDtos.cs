using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;

namespace Uconnect.Application.Outages;

public sealed record OutageUpdateDto(string Status, string Message, DateTimeOffset PostedAt);

public sealed record OutageDto(
    string Reference,
    string Title,
    string Description,
    string Severity,
    string Status,
    IReadOnlyList<string> AffectedAreas,
    DateTimeOffset StartedAt,
    DateTimeOffset? EstimatedResolutionAt,
    DateTimeOffset? ResolvedAt,
    IReadOnlyList<OutageUpdateDto> Updates);

/// <summary>An outage together with the account's services it affects.</summary>
public sealed record AccountOutageDto(OutageDto Outage, IReadOnlyList<string> AffectedServiceReferences);

public sealed record DeclareOutageRequest(
    string Title,
    string Description,
    string Severity,
    IReadOnlyList<string> AffectedAreas,
    DateTimeOffset StartedAt,
    DateTimeOffset? EstimatedResolutionAt);

public sealed record PostOutageUpdateRequest(string Status, string Message, DateTimeOffset? EstimatedResolutionAt);

public sealed record AddOutageAreasRequest(IReadOnlyList<string> AffectedAreas);

internal static class OutageRules
{
    public static IRuleBuilderOptions<T, IReadOnlyList<string>> OutwardCodes<T>(this IRuleBuilder<T, IReadOnlyList<string>> rule) =>
        rule.NotEmpty().WithMessage("At least one postcode district is required.")
            .Must(codes => codes is null || codes.Count <= 200).WithMessage("At most 200 postcode districts per request.")
            .Must(codes => codes is null || codes.All(c => !string.IsNullOrWhiteSpace(c) && c.Trim().Length <= 4 && char.IsLetter(c.Trim()[0]) && c.Trim().All(char.IsLetterOrDigit)))
            .WithMessage("Postcode districts must be outward codes such as 'LS1'.");
}

public sealed class DeclareOutageRequestValidator : AbstractValidator<DeclareOutageRequest>
{
    public DeclareOutageRequestValidator()
    {
        RuleFor(r => r.Title).NotEmpty().MaximumLength(150).SafeText(150);
        RuleFor(r => r.Description).NotEmpty().MaximumLength(2000).SafeText(2000);
        RuleFor(r => r.Severity).Must(EnumParsing.IsValid<OutageSeverity>).WithMessage("Severity must be Minor, Major or Critical.");
        RuleFor(r => r.AffectedAreas).OutwardCodes();
        RuleFor(r => r.EstimatedResolutionAt).GreaterThan(r => r.StartedAt).When(r => r.EstimatedResolutionAt is not null);
    }
}

public sealed class PostOutageUpdateRequestValidator : AbstractValidator<PostOutageUpdateRequest>
{
    public PostOutageUpdateRequestValidator()
    {
        RuleFor(r => r.Status).Must(EnumParsing.IsValid<OutageStatus>)
            .WithMessage($"Status must be one of: {string.Join(", ", Enum.GetNames<OutageStatus>())}.");
        RuleFor(r => r.Message).NotEmpty().MaximumLength(2000).SafeText(2000);
    }
}

public sealed class AddOutageAreasRequestValidator : AbstractValidator<AddOutageAreasRequest>
{
    public AddOutageAreasRequestValidator()
    {
        RuleFor(r => r.AffectedAreas).OutwardCodes();
    }
}

internal static class OutageMapping
{
    public static OutageDto ToDto(this Outage outage) => new(
        outage.Reference,
        outage.Title,
        outage.Description,
        outage.Severity.ToString(),
        outage.Status.ToString(),
        outage.AffectedOutwardCodes.ToList(),
        outage.StartedAt,
        outage.EstimatedResolutionAt,
        outage.ResolvedAt,
        outage.Updates.OrderByDescending(u => u.PostedAt).Select(u => new OutageUpdateDto(u.Status.ToString(), u.Message, u.PostedAt)).ToList());
}

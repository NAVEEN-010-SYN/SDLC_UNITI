using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Orders;

/// <summary>A syntactically valid order request with enums parsed and identifiers normalised.</summary>
public sealed record ValidatedOrderRequest(
    string PartnerReference,
    OrderType Type,
    string Uprn,
    string? ProductCode,
    CareLevel CareLevel,
    Guid? ExistingServiceId,
    string? MigrationAuthCode,
    DateOnly RequestedDate);

public sealed record FieldError(string Field, string Code, string Message);

/// <summary>
/// Stateless boundary validation of a single order request, shared by the REST endpoint and the
/// bulk CSV upload so that both paths enforce identical rules.
/// </summary>
public static partial class OrderRequestValidator
{
    public const int MaxRequestedDateHorizonDays = 180;

    public static (ValidatedOrderRequest? Request, IReadOnlyList<FieldError> Errors) Validate(PlaceOrderRequest request, DateOnly today)
    {
        var errors = new List<FieldError>();

        var partnerRef = request.PartnerReference?.Trim() ?? string.Empty;
        if (partnerRef.Length == 0)
        {
            errors.Add(new("partnerReference", "required", "Partner reference is required."));
        }
        else if (!PartnerReferencePattern().IsMatch(partnerRef))
        {
            errors.Add(new("partnerReference", "format", "Partner reference must be 1-40 letters, digits, '-', '_' or '/'."));
        }

        if (!Enum.TryParse<OrderType>(request.OrderType, ignoreCase: true, out var type) || !Enum.IsDefined(type))
        {
            errors.Add(new("orderType", "unknown", "Order type must be one of PROVIDE, CEASE, MODIFY, MIGRATE."));
        }

        string? uprn = null;
        if (!Uprns.IsValid(request.Uprn))
        {
            errors.Add(new("uprn", "format", "UPRN must be 1 to 12 digits."));
        }
        else
        {
            uprn = Uprns.Normalise(request.Uprn);
        }

        var care = CareLevel.Standard;
        if (!string.IsNullOrWhiteSpace(request.CareLevel) && (!Enum.TryParse(request.CareLevel, true, out care) || !Enum.IsDefined(care)))
        {
            errors.Add(new("careLevel", "unknown", "Care level must be STANDARD, ENHANCED or PREMIUM."));
        }

        var productCode = string.IsNullOrWhiteSpace(request.ProductCode) ? null : request.ProductCode.Trim().ToUpperInvariant();
        var authCode = string.IsNullOrWhiteSpace(request.MigrationAuthCode) ? null : request.MigrationAuthCode.Trim().ToUpperInvariant();

        if (errors.All(e => e.Field != "orderType"))
        {
            ValidateTypeSpecific(type, productCode, request.ExistingServiceId, authCode, errors);
        }

        if (request.RequestedDate < today.AddDays(1))
        {
            errors.Add(new("requestedDate", "past", "Requested date must be after today."));
        }
        else if (request.RequestedDate > today.AddDays(MaxRequestedDateHorizonDays))
        {
            errors.Add(new("requestedDate", "too_far", $"Requested date must be within {MaxRequestedDateHorizonDays} days."));
        }

        if (errors.Count > 0)
        {
            return (null, errors);
        }

        return (new ValidatedOrderRequest(partnerRef, type, uprn!, productCode, care, request.ExistingServiceId, authCode, request.RequestedDate), errors);
    }

    private static void ValidateTypeSpecific(OrderType type, string? productCode, Guid? serviceId, string? authCode, List<FieldError> errors)
    {
        var needsProduct = type is OrderType.Provide or OrderType.Modify or OrderType.Migrate;
        if (needsProduct && productCode is null)
        {
            errors.Add(new("productCode", "required", $"{type} orders require a product code."));
        }

        if (type == OrderType.Cease && productCode is not null)
        {
            errors.Add(new("productCode", "not_allowed", "Cease orders must not specify a product."));
        }

        var needsService = type is OrderType.Cease or OrderType.Modify;
        if (needsService && serviceId is null)
        {
            errors.Add(new("existingServiceId", "required", $"{type} orders require the existing service id."));
        }

        if (!needsService && serviceId is not null)
        {
            errors.Add(new("existingServiceId", "not_allowed", $"{type} orders must not reference an existing service."));
        }

        if (type == OrderType.Migrate)
        {
            if (authCode is null)
            {
                errors.Add(new("migrationAuthCode", "required", "Migrate orders require the switching code from the losing provider."));
            }
            else if (!SwitchingCodePattern().IsMatch(authCode))
            {
                errors.Add(new("migrationAuthCode", "format", "Switching code must be 3 letters followed by 6 digits (e.g. ABC123456)."));
            }
        }
        else if (authCode is not null)
        {
            errors.Add(new("migrationAuthCode", "not_allowed", "Only migrate orders take a switching code."));
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_/-]{1,40}$")]
    private static partial Regex PartnerReferencePattern();

    [GeneratedRegex("^[A-Z]{3}[0-9]{6}$")]
    private static partial Regex SwitchingCodePattern();
}

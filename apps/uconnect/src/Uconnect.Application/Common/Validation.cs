using FluentValidation;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

public static class ValidationExtensions
{
    /// <summary>Validates <paramref name="request"/> and throws <see cref="RequestValidationException"/> on failure.</summary>
    public static async Task EnsureValidAsync<T>(this IValidator<T> validator, T request, CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(request, cancellationToken).ConfigureAwait(false);
        if (result.IsValid)
        {
            return;
        }

        // Group messages by camelCase field name, dropping duplicates.
        var grouped = new Dictionary<string, List<string>>();
        foreach (var failure in result.Errors)
        {
            var field = ToCamelCase(failure.PropertyName);
            if (!grouped.TryGetValue(field, out var messages))
            {
                messages = new List<string>();
                grouped[field] = messages;
            }

            if (!messages.Contains(failure.ErrorMessage))
            {
                messages.Add(failure.ErrorMessage);
            }
        }

        var errors = new Dictionary<string, string[]>();
        foreach (var entry in grouped)
        {
            errors[entry.Key] = entry.Value.ToArray();
        }

        throw new RequestValidationException(errors);
    }

    private static string ToCamelCase(string propertyName)
    {
        if (string.IsNullOrEmpty(propertyName))
        {
            return "request";
        }

        var parts = propertyName.Split('.');
        for (var i = 0; i < parts.Length; i++)
        {
            if (parts[i].Length > 0)
            {
                parts[i] = char.ToLowerInvariant(parts[i][0]) + parts[i].Substring(1);
            }
        }

        return string.Join('.', parts);
    }
}

/// <summary>Reusable rule builders so every validator enforces the same formats as the domain.</summary>
public static class CommonRules
{
    public static IRuleBuilderOptions<T, string?> ValidEmail<T>(this IRuleBuilder<T, string?> rule) =>
        rule.NotEmpty().MaximumLength(254).EmailAddress().WithMessage("Enter a valid e-mail address.");

    public static IRuleBuilderOptions<T, string?> ValidUkPhone<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(BeValidPhone).WithMessage("Enter a valid UK phone number.");

    public static IRuleBuilderOptions<T, string?> ValidPostcode<T>(this IRuleBuilder<T, string?> rule) =>
        rule.NotEmpty().Must(BeValidPostcode).WithMessage("Enter a valid UK postcode.");

    public static IRuleBuilderOptions<T, string?> ValidAccountNumber<T>(this IRuleBuilder<T, string?> rule) =>
        rule.Must(v => AccountNumber.TryParse(v, out _)).WithMessage("Account number must look like ACC-12345678.");

    public static IRuleBuilderOptions<T, MoneyDto?> PositiveMoney<T>(this IRuleBuilder<T, MoneyDto?> rule) =>
        rule.NotNull()
            .Must(m => m is not null && m.AmountMinor > 0).WithMessage("Amount must be greater than zero.")
            .Must(m => m is not null && m.Currency is "GBP" or "USD" or "EUR").WithMessage("Currency is not supported.");

    public static IRuleBuilderOptions<T, string?> SafeText<T>(this IRuleBuilder<T, string?> rule, int maxLength) =>
        rule.MaximumLength(maxLength).Must(v => !HasUnsupportedControlChars(v))
            .WithMessage("Text contains unsupported characters.");

    /// <summary>True when the text has control characters other than newline, carriage return or tab.</summary>
    private static bool HasUnsupportedControlChars(string? value)
    {
        if (value is null)
        {
            return false;
        }

        foreach (var c in value)
        {
            if (char.IsControl(c) && c != '\n' && c != '\r' && c != '\t')
            {
                return true;
            }
        }

        return false;
    }

    private static bool BeValidPhone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            PhoneNumber.Create(value);
            return true;
        }
        catch (DomainException)
        {
            return false;
        }
    }

    private static bool BeValidPostcode(string? value)
    {
        try
        {
            _ = new PostalAddress("x", null, "x", value ?? string.Empty);
            return true;
        }
        catch (DomainException)
        {
            return false;
        }
    }
}

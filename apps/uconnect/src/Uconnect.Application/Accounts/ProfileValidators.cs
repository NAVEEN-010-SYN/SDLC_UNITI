using FluentValidation;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Common;

namespace Uconnect.Application.Accounts;

public sealed class AddressValidator : AbstractValidator<AddressDto>
{
    public AddressValidator()
    {
        RuleFor(a => a.Line1).NotEmpty().MaximumLength(120);
        RuleFor(a => a.Line2).MaximumLength(120);
        RuleFor(a => a.Town).NotEmpty().MaximumLength(80);
        RuleFor(a => a.CountryCode).Length(2).When(a => !string.IsNullOrEmpty(a.CountryCode));
        RuleFor(a => a.Postcode).ValidPostcode().When(a => string.IsNullOrEmpty(a.CountryCode) || a.CountryCode == "GB");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(160).SafeText(160);
        RuleFor(r => r.BillingEmail).ValidEmail();
        RuleFor(r => r.Phone).ValidUkPhone().When(r => !string.IsNullOrWhiteSpace(r.Phone));
        RuleFor(r => r.BillingAddress).NotNull().SetValidator(new AddressValidator());
    }
}

public sealed class ChangeBillingDayRequestValidator : AbstractValidator<ChangeBillingDayRequest>
{
    public ChangeBillingDayRequestValidator()
    {
        RuleFor(r => r.BillingDay)
            .InclusiveBetween(Account.MinBillingDay, Account.MaxBillingDay)
            .WithMessage($"Billing day must be between {Account.MinBillingDay} and {Account.MaxBillingDay}.");
    }
}

public sealed class InviteUserRequestValidator : AbstractValidator<InviteUserRequest>
{
    public InviteUserRequestValidator()
    {
        RuleFor(r => r.SubjectId).NotEmpty().MaximumLength(128);
        RuleFor(r => r.Email).ValidEmail();
        RuleFor(r => r.DisplayName).NotEmpty().MaximumLength(120).SafeText(120);
        RuleFor(r => r.Role)
            .Must(r => r is UserRoles.BusinessAdmin or UserRoles.BusinessUser)
            .WithMessage($"Role must be {UserRoles.BusinessAdmin} or {UserRoles.BusinessUser}.");
    }
}

public sealed class ChangeUserRoleRequestValidator : AbstractValidator<ChangeUserRoleRequest>
{
    public ChangeUserRoleRequestValidator()
    {
        RuleFor(r => r.Role)
            .Must(r => r is UserRoles.BusinessAdmin or UserRoles.BusinessUser)
            .WithMessage($"Role must be {UserRoles.BusinessAdmin} or {UserRoles.BusinessUser}.");
    }
}

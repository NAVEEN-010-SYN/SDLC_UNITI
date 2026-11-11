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

using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Application.Payments;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using static Uconnect.Tests.TestData;

namespace Uconnect.Tests.Application;

public sealed class PaymentServiceTests
{
    private readonly IAccountRepository _accounts = Substitute.For<IAccountRepository>();
    private readonly IAccountUserRepository _accountUsers = Substitute.For<IAccountUserRepository>();
    private readonly IInvoiceRepository _invoices = Substitute.For<IInvoiceRepository>();
    private readonly IPaymentRepository _payments = Substitute.For<IPaymentRepository>();
    private readonly IPaymentMethodRepository _methods = Substitute.For<IPaymentMethodRepository>();
    private readonly IInvoiceNumberLookup _lookup = Substitute.For<IInvoiceNumberLookup>();
    private readonly IPaymentGateway _gateway = Substitute.For<IPaymentGateway>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();

    private readonly Account _account = Account();
    private readonly Invoice _invoice;
    private readonly PaymentMethod _card;
    private readonly PaymentService _service;

    public PaymentServiceTests()
    {
        _invoice = IssuedInvoice(_account.Id, 50_00, new DateOnly(2026, 11, 1));
        _card = Card(_account.Id);

        _clock.UtcNow.Returns(Now);
        _clock.Today.Returns(Today);
        _user.IsAuthenticated.Returns(true);
        _user.SubjectId.Returns("sub-123");
        _accounts.GetByNumberAsync(_account.Number, Arg.Any<CancellationToken>()).Returns(_account);
        _accountUsers.FindActiveAsync(_account.Id, "sub-123", Arg.Any<CancellationToken>())
            .Returns(new AccountUser(Guid.NewGuid(), _account.Id, "sub-123", EmailAddress.Create("me@example.com"), "Me", UserRoles.Consumer, Now));
        _invoices.GetByNumberAsync(_account.Id, _invoice.InvoiceNumber, Arg.Any<CancellationToken>()).Returns(_invoice);
        _methods.GetByIdAsync(_card.Id, Arg.Any<CancellationToken>()).Returns(_card);

        var guard = new AccountAccessGuard(_accounts, _accountUsers, _user);
        var executor = new PaymentExecutor(_payments, _invoices, _gateway, _unitOfWork, _clock, NullLogger<PaymentExecutor>.Instance);
        _service = new PaymentService(
            guard, _invoices, _payments, _methods, _lookup, _gateway, executor, _user, _unitOfWork, _clock,
            new PayInvoiceRequestValidator(), new RefundPaymentRequestValidator(), NullLogger<PaymentService>.Instance);
    }

    private PayInvoiceRequest FullBalance => new(_card.Id, new MoneyDto(_invoice.BalanceDue.AmountMinor, "GBP"));

    [Fact]
    public async Task Successful_payment_settles_the_invoice()
    {
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Success("ch_1"));

        var result = await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-1", CancellationToken.None);

        Assert.Equal(nameof(PaymentStatus.Succeeded), result.Status);
        Assert.Equal(InvoiceStatus.Paid, _invoice.Status);
        _payments.Received(1).Add(Arg.Is<Payment>(p => p.IdempotencyKey == "key-1" && p.Channel == PaymentChannel.Portal));
        await _gateway.Received(1).ChargeAsync(Arg.Is<GatewayChargeRequest>(r => r.IdempotencyKey.StartsWith("pay-") && r.PaymentToken == _card.GatewayToken), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Declined_payment_is_recorded_and_reported()
    {
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Declined("insufficient_funds", "Insufficient funds"));

        var ex = await Assert.ThrowsAsync<PaymentDeclinedException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-2", CancellationToken.None));

        Assert.Equal("insufficient_funds", ex.FailureCode);
        Assert.Equal(InvoiceStatus.Issued, _invoice.Status);
    }

    [Fact]
    public async Task Retry_with_the_same_key_returns_the_original_outcome_without_charging_again()
    {
        var earlier = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, _invoice.BalanceDue, PaymentChannel.Portal, "key-3", Now);
        earlier.MarkSucceeded("ch_9", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-3", Arg.Any<CancellationToken>()).Returns(earlier);

        var result = await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-3", CancellationToken.None);

        Assert.Equal(earlier.Id, result.Id);
        await _gateway.DidNotReceiveWithAnyArgs().ChargeAsync(default!, default);
    }

    [Fact]
    public async Task Interrupted_pending_payment_is_resumed_on_retry()
    {
        var pending = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, _invoice.BalanceDue, PaymentChannel.Portal, "key-4", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-4", Arg.Any<CancellationToken>()).Returns(pending);
        _gateway.ChargeAsync(Arg.Any<GatewayChargeRequest>(), Arg.Any<CancellationToken>()).Returns(GatewayChargeResult.Success("ch_2"));

        await _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-4", CancellationToken.None);

        Assert.Equal(PaymentStatus.Succeeded, pending.Status);
        await _gateway.Received(1).ChargeAsync(Arg.Is<GatewayChargeRequest>(r => r.IdempotencyKey == $"pay-{pending.Id:N}"), Arg.Any<CancellationToken>());
        _payments.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task Reusing_a_key_for_a_different_amount_is_a_conflict()
    {
        var earlier = new Payment(Guid.NewGuid(), _account.Id, _invoice.Id, _card.Id, Gbp(10_00), PaymentChannel.Portal, "key-5", Now);
        _payments.FindByIdempotencyKeyAsync(_account.Id, "key-5", Arg.Any<CancellationToken>()).Returns(earlier);

        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-5", CancellationToken.None));
        Assert.Equal("payment.idempotency_key_reused", ex.Code);
    }

    [Fact]
    public async Task Amount_above_the_balance_is_rejected_before_charging()
    {
        var request = new PayInvoiceRequest(_card.Id, new MoneyDto(_invoice.BalanceDue.AmountMinor + 1, "GBP"));

        await Assert.ThrowsAsync<RequestValidationException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, request, "key-6", CancellationToken.None));
        await _gateway.DidNotReceiveWithAnyArgs().ChargeAsync(default!, default);
    }

    [Fact]
    public async Task Missing_idempotency_key_is_a_validation_error() =>
        await Assert.ThrowsAsync<RequestValidationException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, null, CancellationToken.None));

    [Fact]
    public async Task Business_user_cannot_pay()
    {
        _accountUsers.FindActiveAsync(_account.Id, "sub-123", Arg.Any<CancellationToken>())
            .Returns(new AccountUser(Guid.NewGuid(), _account.Id, "sub-123", EmailAddress.Create("me@example.com"), "Me", UserRoles.BusinessUser, Now));

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            _service.PayInvoiceAsync(_account.Number.Value, _invoice.InvoiceNumber, FullBalance, "key-7", CancellationToken.None));
    }
}

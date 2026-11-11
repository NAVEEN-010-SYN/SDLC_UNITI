using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Tickets;

namespace Uconnect.Application.Notifications;

/// <summary>
/// Reacts to committed domain events that the customer must hear about, and applies the automatic
/// missed-visit credit. Each handler reloads what it needs, so it is safe to run after the original
/// transaction has completed.
/// </summary>
public sealed class CustomerEventHandlers :
    IDomainEventHandler<InvoiceIssued>,
    IDomainEventHandler<PaymentFailed>,
    IDomainEventHandler<AutopaySuspended>,
    IDomainEventHandler<TicketResolved>,
    IDomainEventHandler<AppointmentRescheduled>,
    IDomainEventHandler<AppointmentMissed>,
    IDomainEventHandler<AccountSuspended>
{
    private readonly IAccountRepository _accounts;
    private readonly IAdjustmentRepository _adjustments;
    private readonly CustomerNotifier _notifier;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;
    private readonly CompensationOptions _compensation;
    private readonly ILogger<CustomerEventHandlers> _logger;

    public CustomerEventHandlers(
        IAccountRepository accounts,
        IAdjustmentRepository adjustments,
        CustomerNotifier notifier,
        IUnitOfWork unitOfWork,
        IClock clock,
        IOptions<CompensationOptions> compensation,
        ILogger<CustomerEventHandlers> logger)
    {
        _accounts = accounts;
        _adjustments = adjustments;
        _notifier = notifier;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _compensation = compensation.Value;
        _logger = logger;
    }

    public Task HandleAsync(InvoiceIssued domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your invoice {domainEvent.InvoiceNumber} is ready",
            domainEvent.Total.IsPositive
                ? new[] { $"Your invoice for {domainEvent.Total} is now available and is due on {domainEvent.DueOn:dd MMMM yyyy}." }
                : new[] { $"Your latest invoice shows a credit of {domainEvent.Total.Negate()}, which will be carried forward to your next bill." },
            $"invoices/{domainEvent.InvoiceNumber}"), cancellationToken);

    public Task HandleAsync(PaymentFailed domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "We couldn't take your payment",
            new[]
            {
                domainEvent.Channel == PaymentChannel.Autopay
                    ? $"Your automatic payment of {domainEvent.Amount} was declined."
                    : $"Your payment of {domainEvent.Amount} was declined.",
                "Please check your payment details or pay with another method to avoid late payment charges.",
            },
            "payments"), cancellationToken);

    public Task HandleAsync(AutopaySuspended domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "Automatic payments have been switched off",
            new[]
            {
                $"We tried to collect your bill {domainEvent.Failures} times without success, so automatic payments are now off.",
                "Please update your payment method and switch autopay back on, or pay your outstanding invoices manually.",
            },
            "payments/autopay"), cancellationToken);

    public Task HandleAsync(TicketResolved domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your support ticket {domainEvent.Reference} has been resolved",
            new[] { $"If the problem is not fixed you can reopen the ticket within {Ticket.ReopenWindowDays} days." },
            $"tickets/{domainEvent.Reference}"), cancellationToken);

    public Task HandleAsync(AppointmentRescheduled domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            $"Your engineer visit {domainEvent.Reference} has moved",
            new[] { $"Your visit is now on {domainEvent.To.Date:dddd d MMMM yyyy} ({domainEvent.To.Window.ToString().ToLowerInvariant()})." },
            "appointments"), cancellationToken);

    public Task HandleAsync(AccountSuspended domainEvent, CancellationToken cancellationToken) =>
        EmailAsync(domainEvent.AccountId, account => new CustomerMessage(
            "Your account has been suspended",
            new[] { "Your account has been suspended. Please pay your overdue balance or contact us to restore full service." },
            "invoices"), cancellationToken);

    /// <summary>Credits the customer automatically when our engineer failed to attend a confirmed visit.</summary>
    public async Task HandleAsync(AppointmentMissed domainEvent, CancellationToken cancellationToken)
    {
        if (!domainEvent.MissedByProvider || _compensation.MissedAppointmentCreditMinor <= 0)
        {
            return;
        }

        var account = await _accounts.GetByIdAsync(domainEvent.AccountId, cancellationToken);
        var source = $"missed-visit:{domainEvent.Reference}";
        if (account is null || await _adjustments.ExistsForSourceAsync(account.Id, domainEvent.ServiceId, source, cancellationToken))
        {
            return;
        }

        var credit = Money.FromMinor(_compensation.MissedAppointmentCreditMinor, account.Currency);
        _adjustments.Add(new AccountAdjustment(
            Guid.NewGuid(),
            account.Id,
            domainEvent.ServiceId,
            AdjustmentReason.MissedAppointmentCompensation,
            $"Compensation for missed engineer visit {domainEvent.Reference}",
            credit.Negate(),
            SystemActors.AppointmentPolicy,
            _clock.UtcNow,
            sourceReference: source));
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Missed-visit credit of {Credit} raised for {AccountNumber} ({Reference})", credit, account.Number, domainEvent.Reference);

        await _notifier.EmailAsync(account, new CustomerMessage(
            "We're sorry we missed your appointment",
            new[]
            {
                $"Our engineer did not attend visit {domainEvent.Reference}. A credit of {credit} will appear on your next invoice.",
                "Please book a new visit at a time that suits you.",
            },
            "appointments"), cancellationToken);
    }

    private async Task EmailAsync(Guid accountId, Func<Account, CustomerMessage> compose, CancellationToken ct)
    {
        var account = await _accounts.GetByIdAsync(accountId, ct);
        if (account is null || account.Status == AccountStatus.Closed)
        {
            return;
        }

        await _notifier.EmailAsync(account, compose(account), ct);
    }
}

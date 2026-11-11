using Uconnect.Domain.Common;

namespace Uconnect.Domain.Accounts;

/// <summary>
/// The billing entity - a consumer household or a business. Owns contact details, billing
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

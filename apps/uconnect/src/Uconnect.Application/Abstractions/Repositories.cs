using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Payments;
using Uconnect.Domain.PlanChanges;
using Uconnect.Domain.Services;
using Uconnect.Domain.Tickets;
using Uconnect.Domain.Usage;

namespace Uconnect.Application.Abstractions;

public interface IAccountRepository
{
    Task<Account?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Account?> GetByNumberAsync(AccountNumber number, CancellationToken ct);

    /// <summary>All active accounts whose billing day falls on <paramref name="billingDay"/>.</summary>
    Task<IReadOnlyList<Account>> ListByBillingDayAsync(int billingDay, CancellationToken ct);

    void Add(Account account);
}

public interface IAccountUserRepository
{
    Task<AccountUser?> FindActiveAsync(Guid accountId, string subjectId, CancellationToken ct);

    Task<IReadOnlyList<AccountUser>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Accounts the subject has active access to, with their role on each.</summary>
    Task<IReadOnlyList<(Account Account, string Role)>> ListAccountsForSubjectAsync(string subjectId, CancellationToken ct);

    void Add(AccountUser user);
}

public interface IPlanRepository
{
    Task<Plan?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Plan?> GetByCodeAsync(string code, CancellationToken ct);

    Task<IReadOnlyList<Plan>> GetManyAsync(IEnumerable<Guid> ids, CancellationToken ct);

    Task<IReadOnlyList<Plan>> ListActiveAsync(ProductType productType, CancellationToken ct);
}

public interface IServiceRepository
{
    Task<Service?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Service>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Live services whose service address lies in any of the given postcode outward codes.</summary>
    Task<IReadOnlyList<Service>> ListLiveInOutwardCodesAsync(IReadOnlyCollection<string> outwardCodes, CancellationToken ct);

    Task<int> CountLiveAsync(Guid accountId, CancellationToken ct);
}

public interface IPlanChangeRepository
{
    Task<PlanChange?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<PlanChange?> GetByProvisioningRefAsync(string orderRef, CancellationToken ct);

    Task<IReadOnlyList<PlanChange>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    /// <summary>Requested or scheduled changes whose effective date is on or before <paramref name="today"/>.</summary>
    Task<IReadOnlyList<PlanChange>> ListDueAsync(DateOnly today, CancellationToken ct);

    /// <summary>Changes currently with the provisioning platform, for status polling.</summary>
    Task<IReadOnlyList<PlanChange>> ListProvisioningAsync(CancellationToken ct);

    Task<IReadOnlyList<PlanChange>> ListUnbilledCompletedAsync(Guid accountId, CancellationToken ct);

    void Add(PlanChange planChange);
}

public interface IInvoiceRepository
{
    Task<Invoice?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Invoice?> GetByNumberAsync(Guid accountId, string invoiceNumber, CancellationToken ct);

    Task<PagedResult<Invoice>> ListByAccountAsync(Guid accountId, InvoiceStatus? status, PageRequest page, CancellationToken ct);

    /// <summary>Issued, part-paid and overdue invoices, oldest due first.</summary>
    Task<IReadOnlyList<Invoice>> ListPayableAsync(Guid accountId, CancellationToken ct);

    /// <summary>Payable invoices across all accounts with a due date on or before <paramref name="dueOnOrBefore"/>.</summary>
    Task<IReadOnlyList<Invoice>> ListPayableDueByAsync(DateOnly dueOnOrBefore, CancellationToken ct);

    Task<Invoice?> GetLatestIssuedAsync(Guid accountId, CancellationToken ct);

    Task<bool> ExistsForPeriodAsync(Guid accountId, DateOnly periodStart, CancellationToken ct);

    void Add(Invoice invoice);
}

public interface IAdjustmentRepository
{
    Task<IReadOnlyList<AccountAdjustment>> ListUnbilledAsync(Guid accountId, CancellationToken ct);

    Task<IReadOnlyList<AccountAdjustment>> ListByAccountAsync(Guid accountId, int take, CancellationToken ct);

    /// <summary>True when a compensation adjustment already exists for the given source (outage / appointment) and service.</summary>
    Task<bool> ExistsForSourceAsync(Guid accountId, Guid? serviceId, string sourceReference, CancellationToken ct);

    void Add(AccountAdjustment adjustment);
}

public interface IPaymentRepository
{
    Task<Payment?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Payment?> FindByIdempotencyKeyAsync(Guid accountId, string idempotencyKey, CancellationToken ct);

    Task<PagedResult<Payment>> ListByAccountAsync(Guid accountId, PageRequest page, CancellationToken ct);

    Task<IReadOnlyList<Payment>> ListByInvoiceAsync(Guid invoiceId, CancellationToken ct);

    void Add(Payment payment);
}

public interface IPaymentMethodRepository
{
    Task<IReadOnlyList<PaymentMethod>> ListByAccountAsync(Guid accountId, CancellationToken ct);

    Task<PaymentMethod?> GetByIdAsync(Guid id, CancellationToken ct);

    void Add(PaymentMethod method);
}

public interface IAutopayRepository
{
    Task<AutopaySettings?> GetByAccountAsync(Guid accountId, CancellationToken ct);

    Task<IReadOnlyList<AutopaySettings>> ListEnabledAsync(CancellationToken ct);

    void Add(AutopaySettings settings);
}

public interface IUsageRepository
{
    Task<IReadOnlyList<UsageRecord>> ListAsync(Guid serviceId, DateOnly fromInclusive, DateOnly toExclusive, CancellationToken ct);

    Task<UsageRecord?> FindAsync(Guid serviceId, DateOnly date, CancellationToken ct);

    void Add(UsageRecord record);
}

public interface IOutageRepository
{
    Task<Outage?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Outage?> GetByReferenceAsync(string reference, CancellationToken ct);

    /// <summary>Unresolved outages plus those resolved since <paramref name="resolvedSince"/>.</summary>
    Task<IReadOnlyList<Outage>> ListCurrentAsync(DateTimeOffset resolvedSince, CancellationToken ct);

    Task<PagedResult<Outage>> ListAsync(bool includeResolved, PageRequest page, CancellationToken ct);

    Task<bool> HasNotificationAsync(Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, CancellationToken ct);

    void Add(Outage outage);

    void AddNotification(OutageNotification notification);
}

public interface ITicketRepository
{
    Task<Ticket?> GetByReferenceAsync(string reference, CancellationToken ct);

    Task<PagedResult<Ticket>> ListByAccountAsync(Guid accountId, bool openOnly, PageRequest page, CancellationToken ct);

    Task<IReadOnlyList<Ticket>> ListOpenByServiceAsync(Guid serviceId, CancellationToken ct);

    /// <summary>Resolved or pending-customer tickets with no activity since <paramref name="inactiveSince"/>.</summary>
    Task<IReadOnlyList<Ticket>> ListAutoCloseCandidatesAsync(DateTimeOffset inactiveSince, CancellationToken ct);

    void Add(Ticket ticket);
}

public interface IAppointmentRepository
{
    Task<Appointment?> GetByReferenceAsync(string reference, CancellationToken ct);

    Task<IReadOnlyList<Appointment>> ListByAccountAsync(Guid accountId, bool upcomingOnly, DateOnly today, CancellationToken ct);

    Task<bool> HasActiveForServiceAsync(Guid serviceId, AppointmentType type, CancellationToken ct);

    void Add(Appointment appointment);
}

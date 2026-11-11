namespace Uconnect.Domain.Common;

/// <summary>Whether an account is a consumer household or a business.</summary>
public enum AccountType
{
    Consumer = 1,
    Business = 2,
}

public enum AccountStatus
{
    Active = 1,
    Suspended = 2,
    Closed = 3,
}

/// <summary>Platform roles (see CONVENTIONS.md). Values are the JWT role claim strings.</summary>
public static class UserRoles
{
    public const string Consumer = "CONSUMER";
    public const string BusinessAdmin = "BUSINESS_ADMIN";
    public const string BusinessUser = "BUSINESS_USER";
    public const string PartnerAdmin = "PARTNER_ADMIN";
    public const string PartnerAgent = "PARTNER_AGENT";
    public const string WholesaleBuyer = "WHOLESALE_BUYER";
    public const string SupportAgent = "SUPPORT_AGENT";

    public static readonly IReadOnlyList<string> All = new[]
    {
        Consumer, BusinessAdmin, BusinessUser, PartnerAdmin, PartnerAgent, WholesaleBuyer, SupportAgent,
    };
}

public enum ProductType
{
    Broadband = 1,
    Voice = 2,
    SdWan = 3,
    HostedServices = 4,
}

public enum ServiceStatus
{
    PendingActivation = 1,
    Active = 2,
    Suspended = 3,
    Cancelled = 4,
}

public enum PlanChangeType
{
    Upgrade = 1,
    Downgrade = 2,
    Lateral = 3,
}

public enum PlanChangeStatus
{
    Requested = 1,
    Scheduled = 2,
    Provisioning = 3,
    Completed = 4,
    Failed = 5,
    Cancelled = 6,
}

public enum InvoiceStatus
{
    Draft = 1,
    Issued = 2,
    PartiallyPaid = 3,
    Paid = 4,
    Overdue = 5,
    Void = 6,
}

public enum InvoiceLineType
{
    Recurring = 1,
    Proration = 2,
    OneOff = 3,
    Usage = 4,
    Credit = 5,
    Discount = 6,
    EarlyTerminationFee = 7,
}

public enum PaymentStatus
{
    Pending = 1,
    Succeeded = 2,
    Failed = 3,
    Refunded = 4,
    PartiallyRefunded = 5,
}

public enum PaymentMethodType
{
    Card = 1,
    DirectDebit = 2,
}

/// <summary>How a payment was initiated.</summary>
public enum PaymentChannel
{
    Portal = 1,
    Autopay = 2,
    Agent = 3,
}

public enum TicketPriority
{
    P1 = 1,
    P2 = 2,
    P3 = 3,
    P4 = 4,
}

public enum TicketStatus
{
    Open = 1,
    InProgress = 2,
    PendingCustomer = 3,
    Resolved = 4,
    Closed = 5,
}

public enum TicketCategory
{
    Fault = 1,
    Billing = 2,
    PlanChange = 3,
    Installation = 4,
    General = 5,
    Complaint = 6,
}

public enum AppointmentType
{
    Installation = 1,
    Repair = 2,
    Upgrade = 3,
    Survey = 4,
}

public enum AppointmentStatus
{
    Requested = 1,
    Confirmed = 2,
    Completed = 3,
    Cancelled = 4,
    Missed = 5,
}

/// <summary>Engineer visit time windows offered to customers.</summary>
public enum AppointmentWindow
{
    Morning = 1,
    Afternoon = 2,
    AllDay = 3,
}

public enum OutageSeverity
{
    Minor = 1,
    Major = 2,
    Critical = 3,
}

public enum OutageStatus
{
    Investigating = 1,
    Identified = 2,
    Monitoring = 3,
    Resolved = 4,
}

public enum NotificationChannel
{
    Email = 1,
    Sms = 2,
}

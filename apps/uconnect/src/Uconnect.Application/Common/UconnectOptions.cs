using System.ComponentModel.DataAnnotations;
using Uconnect.Domain.Billing;

namespace Uconnect.Application.Common;

/// <summary>Billing configuration (section <c>Uconnect:Billing</c>).</summary>
public sealed class BillingOptions
{
    public const string SectionName = "Uconnect:Billing";

    /// <summary>Days between invoice issue and due date.</summary>
    [Range(0, 60)]
    public int PaymentTermsDays { get; set; } = 14;

    /// <summary>Tax rate in basis points (2000 = 20% VAT).</summary>
    [Range(0, 10_000)]
    public int TaxRateBasisPoints { get; set; } = TaxCalculator.UkStandardVatBasisPoints;

    /// <summary>Late payment fee in minor units applied once an invoice is this many days overdue.</summary>
    [Range(0, 10_000)]
    public long LatePaymentFeeMinor { get; set; } = 500;

    [Range(1, 90)]
    public int LatePaymentFeeAfterDays { get; set; } = 14;

    /// <summary>Accounts are suspended when an invoice is this many days overdue.</summary>
    [Range(7, 120)]
    public int SuspendAfterDaysOverdue { get; set; } = 45;
}

/// <summary>Compensation amounts (section <c>Uconnect:Compensation</c>).</summary>
public sealed class CompensationOptions
{
    public const string SectionName = "Uconnect:Compensation";

    /// <summary>Automatic credit when an engineer misses a confirmed visit, in minor units.</summary>
    [Range(0, 100_000)]
    public long MissedAppointmentCreditMinor { get; set; } = 30_00;

    public bool AutomaticOutageCredits { get; set; } = true;
}

/// <summary>Customer-facing links used in notifications (section <c>Uconnect:Portal</c>).</summary>
public sealed class PortalOptions
{
    public const string SectionName = "Uconnect:Portal";

    [Required]
    [Url]
    public string BaseUrl { get; set; } = "https://my.uniti.example";

    [Required]
    public string SupportPhone { get; set; } = "0800 000 0000";
}

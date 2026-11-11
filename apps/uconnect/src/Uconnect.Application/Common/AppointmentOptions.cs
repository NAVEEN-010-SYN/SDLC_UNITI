using System.ComponentModel.DataAnnotations;

namespace Uconnect.Application.Common;

/// <summary>Engineer visit charges (section <c>Uconnect:Appointments</c>).</summary>
public sealed class AppointmentOptions
{
    public const string SectionName = "Uconnect:Appointments";

    /// <summary>Call-out fee charged when a customer cancels inside the change cut-off, in minor units.</summary>
    [Range(0, 100_000)]
    public long LateCancellationFeeMinor { get; set; } = 25_00;

    public bool ChargeLateCancellation { get; set; } = true;
}

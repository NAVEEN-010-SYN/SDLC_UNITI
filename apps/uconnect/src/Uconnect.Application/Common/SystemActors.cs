namespace Uconnect.Application.Common;

/// <summary>
/// Fixed user ids recorded as the author of changes made by automated processes rather than a
/// person, so audit trails always say who (or what) raised a charge or credit.
/// </summary>
public static class SystemActors
{
    public static readonly Guid BillingRun = new("5b1c0000-0000-4000-8000-000000000001");

    public static readonly Guid OutageCompensation = new("5b1c0000-0000-4000-8000-000000000002");

    public static readonly Guid AppointmentPolicy = new("5b1c0000-0000-4000-8000-000000000003");

    public static readonly Guid NetworkOperations = new("5b1c0000-0000-4000-8000-000000000004");

    public const string NetworkOperationsName = "Network operations";
}

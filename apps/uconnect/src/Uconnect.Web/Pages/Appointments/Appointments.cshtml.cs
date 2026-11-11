using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Uconnect.Application.Appointments;
using Uconnect.Application.Outages;
using Uconnect.Application.Services;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Appointments;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<AppointmentDto> Appointments { get; private set; } = Array.Empty<AppointmentDto>();

    public async Task OnGetAsync(CancellationToken ct) =>
        Appointments = await Api.GetAsync<IReadOnlyList<AppointmentDto>>(AccountPath("appointments?upcomingOnly=false"), ct);

    public async Task<IActionResult> OnPostCancelAsync(string reference, [Required, StringLength(500)] string reason, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await OnGetAsync(ct);
            return Page();
        }

        var appointment = await Api.SendAsync<AppointmentDto>(
            HttpMethod.Post, AccountPath($"appointments/{Uri.EscapeDataString(reference)}/cancel"), new CancelAppointmentRequest(reason), ct);
        TempData["Notice"] = appointment.LateCancellation
            ? $"Visit {reference} cancelled. As this was within 24 hours of the visit, a call-out fee may apply."
            : $"Visit {reference} cancelled.";
        return RedirectToPage();
    }
}

/// <summary>
/// Booking flow: pick the visit type and service, see the windows with engineer capacity, then book.
/// Also used to reschedule an existing visit when <see cref="Reference"/> is supplied.
/// </summary>
public sealed class BookModel : AccountPageModel
{
    public BookModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string Type { get; set; } = "Repair";

    [BindProperty(SupportsGet = true)]
    public Guid? ServiceId { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? TicketReference { get; set; }

    [BindProperty(SupportsGet = true)]
    public string? Reference { get; set; }

    [BindProperty]
    [Required(ErrorMessage = "Choose a visit window.")]
    public string? Slot { get; set; }

    [BindProperty]
    [Required]
    [StringLength(120)]
    public string ContactName { get; set; } = string.Empty;

    [BindProperty]
    [Required]
    [Phone]
    public string ContactPhone { get; set; } = string.Empty;

    [BindProperty]
    [StringLength(500)]
    public string? AccessNotes { get; set; }

    public IReadOnlyList<ServiceSummaryDto> Services { get; private set; } = Array.Empty<ServiceSummaryDto>();

    public IReadOnlyList<AvailableSlotDto> Slots { get; private set; } = Array.Empty<AvailableSlotDto>();

    public async Task OnGetAsync(CancellationToken ct)
    {
        ContactName = User.Identity?.Name ?? string.Empty;
        await LoadAsync(ct);
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid || !TryParseSlot(Slot, out var date, out var window))
        {
            ModelState.AddModelError(nameof(Slot), "Choose a visit window.");
            await LoadAsync(ct);
            return Page();
        }

        if (Reference is not null)
        {
            await Api.SendAsync<AppointmentDto>(
                HttpMethod.Put, AccountPath($"appointments/{Uri.EscapeDataString(Reference)}/slot"), new RescheduleAppointmentRequest(date, window), ct);
            TempData["Notice"] = $"Visit {Reference} moved to {Display.Date(date)} ({window.ToLowerInvariant()}).";
        }
        else
        {
            var booked = await Api.SendAsync<AppointmentDto>(
                HttpMethod.Post,
                AccountPath("appointments"),
                new BookAppointmentRequest(Type, ServiceId, TicketReference, date, window, ContactName, ContactPhone, AccessNotes),
                ct);
            TempData["Notice"] = $"Visit {booked.Reference} booked for {Display.Date(booked.Date)} ({booked.Window.ToLowerInvariant()}).";
        }

        return RedirectToPage("Index");
    }

    internal static bool TryParseSlot(string? value, out DateOnly date, out string window)
    {
        date = default;
        window = string.Empty;
        var parts = value?.Split('|');
        if (parts is not { Length: 2 } || !DateOnly.TryParseExact(parts[0], "yyyy-MM-dd", out date))
        {
            return false;
        }

        window = parts[1];
        return window.Length > 0;
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        Services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        var query = $"appointment-slots?type={Uri.EscapeDataString(Type)}" + (ServiceId is { } id ? $"&serviceId={id}" : string.Empty);
        Slots = await Api.GetAsync<IReadOnlyList<AvailableSlotDto>>(AccountPath(query), ct);
    }
}

public sealed class OutagesModel : AccountPageModel
{
    public OutagesModel(UconnectApiClient api) : base(api)
    {
    }

    public IReadOnlyList<AccountOutageDto> Outages { get; private set; } = Array.Empty<AccountOutageDto>();

    public async Task OnGetAsync(CancellationToken ct) =>
        Outages = await Api.GetAsync<IReadOnlyList<AccountOutageDto>>(AccountPath("outages"), ct);
}

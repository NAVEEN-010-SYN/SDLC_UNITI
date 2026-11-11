using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Uconnect.Application.Common;
using Uconnect.Application.Services;
using Uconnect.Application.Tickets;
using Uconnect.Domain.Common;
using Uconnect.Web.Api;

namespace Uconnect.Web.Pages.Tickets;

public sealed class IndexModel : AccountPageModel
{
    public IndexModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public bool OpenOnly { get; set; } = true;

    public PagedResult<TicketSummaryDto>? Tickets { get; private set; }

    public async Task OnGetAsync(int? page, CancellationToken ct)
    {
        var paging = PageOf(page);
        Tickets = await Api.GetAsync<PagedResult<TicketSummaryDto>>(
            AccountPath($"tickets?openOnly={OpenOnly}&page={paging.Page}&pageSize={paging.PageSize}"), ct);
    }
}

public sealed class NewModel : AccountPageModel
{
    public NewModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty]
    public TicketInput Input { get; set; } = new();

    public IReadOnlyList<SelectListItem> ServiceOptions { get; private set; } = Array.Empty<SelectListItem>();

    public static IEnumerable<SelectListItem> Categories => Enum.GetNames<TicketCategory>().Select(c => new SelectListItem(c, c));

    public Task OnGetAsync(Guid? serviceId, CancellationToken ct)
    {
        Input.ServiceId = serviceId;
        return LoadServicesAsync(ct);
    }

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            await LoadServicesAsync(ct);
            return Page();
        }

        try
        {
            var ticket = await Api.SendAsync<TicketDetailDto>(
                HttpMethod.Post,
                AccountPath("tickets"),
                new CreateTicketRequest(Input.ServiceId, Input.Category, Input.Subject, Input.Description, Input.ServiceDown),
                ct);
            TempData["Notice"] = $"Ticket {ticket.Summary.Reference} raised. We'll respond by {Display.When(ticket.FirstResponseDueAt)}.";
            return RedirectToPage("Details", new { reference = ticket.Summary.Reference });
        }
        catch (ApiProblemException)
        {
            await LoadServicesAsync(ct);
            throw;
        }
    }

    private async Task LoadServicesAsync(CancellationToken ct)
    {
        var services = await Api.GetAsync<IReadOnlyList<ServiceSummaryDto>>(AccountPath("services"), ct);
        ServiceOptions = services.Select(s => new SelectListItem($"{s.ServiceReference} \u2013 {s.Plan.Name}, {s.ServiceAddress.Postcode}", s.Id.ToString())).ToList();
    }

    public sealed class TicketInput
    {
        public Guid? ServiceId { get; set; }

        [Required]
        public string Category { get; set; } = nameof(TicketCategory.Fault);

        [Required]
        [StringLength(150)]
        public string Subject { get; set; } = string.Empty;

        [Required]
        [StringLength(4000)]
        public string Description { get; set; } = string.Empty;

        public bool ServiceDown { get; set; }
    }
}

public sealed class DetailsModel : AccountPageModel
{
    public DetailsModel(UconnectApiClient api) : base(api)
    {
    }

    [BindProperty(SupportsGet = true)]
    public string Reference { get; set; } = string.Empty;

    [BindProperty]
    [StringLength(4000)]
    public string? Message { get; set; }

    public TicketDetailDto? Ticket { get; private set; }

    public async Task OnGetAsync(CancellationToken ct) => Ticket = await LoadAsync(ct);

    public Task<IActionResult> OnPostCommentAsync(CancellationToken ct) =>
        ActAsync("comments", new AddTicketCommentRequest(Message ?? string.Empty, false), "Your message has been added.", ct);

    public Task<IActionResult> OnPostReopenAsync(CancellationToken ct) =>
        ActAsync("reopen", new ReopenTicketRequest(Message ?? string.Empty), "The ticket has been reopened.", ct);

    public Task<IActionResult> OnPostCloseAsync(CancellationToken ct) =>
        ActAsync("close", null, "The ticket has been closed.", ct);

    private async Task<IActionResult> ActAsync(string action, object? body, string notice, CancellationToken ct)
    {
        try
        {
            await Api.SendAsync<TicketDetailDto>(HttpMethod.Post, AccountPath($"tickets/{Uri.EscapeDataString(Reference)}/{action}"), body, ct);
        }
        catch (ApiProblemException problem)
        {
            AddProblem(problem, prefix: string.Empty);
            Ticket = await LoadAsync(ct);
            return Page();
        }

        TempData["Notice"] = notice;
        return RedirectToPage(new { reference = Reference });
    }

    private Task<TicketDetailDto> LoadAsync(CancellationToken ct) =>
        Api.GetAsync<TicketDetailDto>(AccountPath($"tickets/{Uri.EscapeDataString(Reference)}"), ct);
}

using IConnect.Wholesale.Api.Http;
using IConnect.Wholesale.Api.Security;
using IConnect.Wholesale.Application.Appointments;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace IConnect.Wholesale.Api.Controllers;

/// <summary>
/// Order placement, tracking and lifecycle. Partner actions need <c>orders:write</c>; field
/// operations (hold, provisioning, completion, rejection) are restricted to support agents.
/// </summary>
[ApiController]
[Route("api/v1/orders")]
[Produces("application/json")]
public sealed class OrdersController : ControllerBase
{
    private readonly OrderService _orders;
    private readonly AppointmentService _appointments;

    public OrdersController(OrderService orders, AppointmentService appointments)
    {
        _orders = orders;
        _appointments = appointments;
    }

    /// <summary>
    /// Places an order. Idempotent on <c>partnerReference</c>: replaying an identical request returns
    /// the existing order with 200; reusing the reference with different details is a 409.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<OrderDetailDto>> Place(PlaceOrderRequest request, CancellationToken ct)
    {
        var result = await _orders.PlaceAsync(request, ct);
        return result.Created
            ? CreatedAtAction(nameof(Get), new { id = result.Order.Id }, result.Order)
            : Ok(result.Order);
    }

    [HttpGet]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(PagedResult<OrderSummaryDto>), StatusCodes.Status200OK)]
    public Task<PagedResult<OrderSummaryDto>> List([FromQuery] string? status, [FromQuery] string? type, [FromQuery] string? search,
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] PageQuery page, CancellationToken ct)
    {
        QueryParsing.EnsureRange(from, to);
        return _orders.ListAsync(
            QueryParsing.OptionalEnum<OrderStatus>(status, "status"),
            QueryParsing.OptionalEnum<OrderType>(type, "type"),
            search,
            from,
            to,
            page.ToRequest(),
            ct);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(OrderDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public Task<OrderDetailDto> Get(Guid id, CancellationToken ct) => _orders.GetAsync(id, ct);

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    public Task<OrderDetailDto> Cancel(Guid id, CancelOrderRequest request, CancellationToken ct) => _orders.CancelAsync(id, request, ct);

    [HttpPost("{id:guid}/amend")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    public Task<OrderDetailDto> Amend(Guid id, AmendOrderRequest request, CancellationToken ct) => _orders.AmendAsync(id, request, ct);

    [HttpGet("{id:guid}/appointment-slots")]
    [Authorize(Policy = ApiScopes.OrdersRead)]
    [ProducesResponseType(typeof(IReadOnlyList<AppointmentSlotDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<AppointmentSlotDto>> AppointmentSlots(Guid id, [FromQuery] DateOnly? from, CancellationToken ct) =>
        _appointments.AvailableForOrderAsync(id, from, ct);

    /// <summary>Reserves an engineer slot; the hold must be confirmed by provisioning before it expires.</summary>
    [HttpPut("{id:guid}/appointment")]
    [Authorize(Policy = ApiScopes.OrdersWrite)]
    [ProducesResponseType(typeof(BookingDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<BookingDto> BookAppointment(Guid id, BookAppointmentRequest request, CancellationToken ct) =>
        _appointments.BookAsync(id, request, ct);

    [HttpPost("{id:guid}/hold")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Hold(Guid id, HoldOrderRequest request, CancellationToken ct) => _orders.HoldAsync(id, request, ct);

    [HttpPost("{id:guid}/release-hold")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> ReleaseHold(Guid id, CancellationToken ct) => _orders.ReleaseHoldAsync(id, ct);

    [HttpPost("{id:guid}/start-provisioning")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> StartProvisioning(Guid id, CancellationToken ct) => _orders.StartProvisioningAsync(id, ct);

    [HttpPost("{id:guid}/complete")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Complete(Guid id, CompleteOrderRequest request, CancellationToken ct) => _orders.CompleteAsync(id, request, ct);

    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = Policies.SupportOnly)]
    public Task<OrderDetailDto> Reject(Guid id, RejectOrderRequest request, CancellationToken ct) => _orders.RejectAsync(id, request, ct);
}

using IConnect.Wholesale.Application.Abstractions;
using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Sla;

namespace IConnect.Wholesale.Application.Orders;

/// <summary>Order lifecycle actions after placement (partner cancel/amend, support agent actions).</summary>
public sealed partial class OrderService
{
    public Task<OrderDetailDto> CancelAsync(Guid id, CancelOrderRequest request, CancellationToken ct)
    {
        return MutateAsync(id, async (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.Cancel(now, request.Reason.Trim(), _caller.ActorId);
            await ReleaseSlotAsync(order, ct);
        }, ct);
    }

    public Task<OrderDetailDto> AmendAsync(Guid id, AmendOrderRequest request, CancellationToken ct)
    {
        return MutateAsync(id, (order, now) =>
        {
            var today = Calendar.LocalDate(now);
            var horizon = today.AddDays(OrderRequestValidator.MaxRequestedDateHorizonDays);
            if (request.RequestedDate <= today || request.RequestedDate > horizon)
            {
                throw new RequestValidationException("requestedDate", "Requested date must be in the future and within the booking horizon.");
            }

            order.AmendRequestedDate(request.RequestedDate);
            return Task.CompletedTask;
        }, ct);
    }

    public Task<OrderDetailDto> HoldAsync(Guid id, HoldOrderRequest request, CancellationToken ct)
    {
        return SupportMutateAsync(id, (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.PlaceOnHold(now, request.Reason.Trim(), _caller.ActorId);
            return Task.CompletedTask;
        }, ct);
    }

    public Task<OrderDetailDto> ReleaseHoldAsync(Guid id, CancellationToken ct)
    {
        return SupportMutateAsync(id, (order, now) =>
        {
            order.ReleaseHold(now, _caller.ActorId);
            return Task.CompletedTask;
        }, ct);
    }

    public Task<OrderDetailDto> StartProvisioningAsync(Guid id, CancellationToken ct)
    {
        return SupportMutateAsync(id, async (order, now) =>
        {
            if (order.AppointmentSlotId is not null)
            {
                var slotId = order.AppointmentSlotId.Value;
                var slot = await _slots.GetAsync(slotId, ct);
                if (slot is null)
                {
                    throw new NotFoundException("AppointmentSlot", slotId);
                }

                slot.Confirm(order.Id, now);
            }

            order.StartProvisioning(now, _caller.ActorId);
        }, ct);
    }

    public Task<OrderDetailDto> RejectAsync(Guid id, RejectOrderRequest request, CancellationToken ct)
    {
        return SupportMutateAsync(id, async (order, now) =>
        {
            RequireText(request.Reason, "reason");
            order.Reject(now, request.Reason.Trim(), _caller.ActorId);
            await ReleaseSlotAsync(order, ct);
        }, ct);
    }

    /// <summary>Completes the order and applies it to the service inventory.</summary>
    public Task<OrderDetailDto> CompleteAsync(Guid id, CompleteOrderRequest request, CancellationToken ct)
    {
        return SupportMutateAsync(id, async (order, now) =>
        {
            if (request.CompletedDate > Calendar.LocalDate(now))
            {
                throw new RequestValidationException("completedDate", "Completion date cannot be in the future.");
            }

            var serviceId = await ApplyToInventoryAsync(order, request.CompletedDate, ct);
            order.Complete(now, request.CompletedDate, serviceId, _caller.ActorId);
        }, ct);
    }

    private async Task ReleaseSlotAsync(Order order, CancellationToken ct)
    {
        var slotId = order.ReleaseAppointment();
        if (slotId is null)
        {
            return;
        }

        var slot = await _slots.GetAsync(slotId.Value, ct);
        if (slot is not null)
        {
            slot.Release(order.Id);
        }
    }

    private Task<OrderDetailDto> SupportMutateAsync(Guid id, Func<Order, DateTimeOffset, Task> action, CancellationToken ct)
    {
        if (!_caller.IsSupportAgent)
        {
            throw new ForbiddenException("Only support agents can perform this action.");
        }

        return MutateAsync(id, action, ct);
    }

    private async Task<OrderDetailDto> MutateAsync(Guid id, Func<Order, DateTimeOffset, Task> action, CancellationToken ct)
    {
        var order = await LoadOwnedAsync(id, ct);
        var now = _clock.UtcNow;
        await action(order, now);
        await _uow.SaveChangesAsync(ct);
        return OrderMapping.ToDetail(order, Calendar, now, _caller.IsSupportAgent);
    }

    private static void RequireText(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length < 5)
        {
            throw new RequestValidationException(field, "Provide at least 5 characters.");
        }
    }
}

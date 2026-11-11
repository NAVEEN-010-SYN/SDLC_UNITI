using Microsoft.EntityFrameworkCore;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Appointments;
using Uconnect.Domain.Common;
using Uconnect.Domain.Outages;
using Uconnect.Domain.Tickets;

namespace Uconnect.Infrastructure.Persistence.Repositories;

internal sealed class OutageRepository : IOutageRepository
{
    private readonly UconnectDbContext _db;

    public OutageRepository(UconnectDbContext db) => _db = db;

    public Task<Outage?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Outages.FirstOrDefaultAsync(o => o.Id == id, ct);

    public Task<Outage?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Outages.FirstOrDefaultAsync(o => o.Reference == reference, ct);

    public async Task<IReadOnlyList<Outage>> ListCurrentAsync(DateTimeOffset resolvedSince, CancellationToken ct) =>
        await _db.Outages
            .Where(o => o.Status != OutageStatus.Resolved || o.ResolvedAt >= resolvedSince)
            .OrderByDescending(o => o.StartedAt)
            .ToListAsync(ct);

    public Task<PagedResult<Outage>> ListAsync(bool includeResolved, PageRequest page, CancellationToken ct)
    {
        var query = _db.Outages.AsNoTracking();
        if (!includeResolved)
        {
            query = query.Where(o => o.Status != OutageStatus.Resolved);
        }

        return query.OrderByDescending(o => o.StartedAt).ToPagedResultAsync(page, ct);
    }

    public async Task<bool> HasNotificationAsync(Guid outageId, Guid accountId, OutageNotificationKind kind, NotificationChannel channel, CancellationToken ct) =>
        _db.OutageNotifications.Local.Any(n => n.OutageId == outageId && n.AccountId == accountId && n.Kind == kind && n.Channel == channel)
        || await _db.OutageNotifications.AnyAsync(n => n.OutageId == outageId && n.AccountId == accountId && n.Kind == kind && n.Channel == channel, ct);

    public void Add(Outage outage) => _db.Outages.Add(outage);

    public void AddNotification(OutageNotification notification) => _db.OutageNotifications.Add(notification);
}

internal sealed class TicketRepository : ITicketRepository
{
    private static readonly TicketStatus[] OpenStatuses = { TicketStatus.Open, TicketStatus.InProgress, TicketStatus.PendingCustomer };

    private readonly UconnectDbContext _db;

    public TicketRepository(UconnectDbContext db) => _db = db;

    public Task<Ticket?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Tickets.FirstOrDefaultAsync(t => t.Reference == reference, ct);

    public Task<PagedResult<Ticket>> ListByAccountAsync(Guid accountId, bool openOnly, PageRequest page, CancellationToken ct)
    {
        var query = _db.Tickets.AsNoTracking().IgnoreAutoIncludes().Where(t => t.AccountId == accountId);
        if (openOnly)
        {
            query = query.Where(t => OpenStatuses.Contains(t.Status));
        }

        return query.OrderByDescending(t => t.LastActivityAt).ToPagedResultAsync(page, ct);
    }

    public async Task<IReadOnlyList<Ticket>> ListOpenByServiceAsync(Guid serviceId, CancellationToken ct) =>
        await _db.Tickets.AsNoTracking().IgnoreAutoIncludes()
            .Where(t => t.ServiceId == serviceId && OpenStatuses.Contains(t.Status))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Ticket>> ListAutoCloseCandidatesAsync(DateTimeOffset inactiveSince, CancellationToken ct) =>
        await _db.Tickets
            .Where(t => (t.Status == TicketStatus.Resolved && t.ResolvedAt <= inactiveSince)
                || (t.Status == TicketStatus.PendingCustomer && t.LastActivityAt <= inactiveSince))
            .ToListAsync(ct);

    public void Add(Ticket ticket) => _db.Tickets.Add(ticket);
}

internal sealed class AppointmentRepository : IAppointmentRepository
{
    private readonly UconnectDbContext _db;

    public AppointmentRepository(UconnectDbContext db) => _db = db;

    public Task<Appointment?> GetByReferenceAsync(string reference, CancellationToken ct) =>
        _db.Appointments.FirstOrDefaultAsync(a => a.Reference == reference, ct);

    public async Task<IReadOnlyList<Appointment>> ListByAccountAsync(Guid accountId, bool upcomingOnly, DateOnly today, CancellationToken ct)
    {
        var query = _db.Appointments.AsNoTracking().Where(a => a.AccountId == accountId);
        if (upcomingOnly)
        {
            query = query.Where(a => a.Date >= today && (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed));
        }

        return await query.OrderByDescending(a => a.Date).Take(100).ToListAsync(ct);
    }

    public Task<bool> HasActiveForServiceAsync(Guid serviceId, AppointmentType type, CancellationToken ct) =>
        _db.Appointments.AnyAsync(
            a => a.ServiceId == serviceId && a.Type == type && (a.Status == AppointmentStatus.Requested || a.Status == AppointmentStatus.Confirmed),
            ct);

    public void Add(Appointment appointment) => _db.Appointments.Add(appointment);
}

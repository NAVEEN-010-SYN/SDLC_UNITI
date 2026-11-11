using IConnect.Wholesale.Application.Abstractions;

namespace IConnect.Wholesale.Infrastructure.Time;

internal sealed class SystemClock : IClock
{
    private readonly TimeProvider _time;

    public SystemClock(TimeProvider time)
    {
        _time = time;
    }

    public DateTimeOffset UtcNow => _time.GetUtcNow();
}

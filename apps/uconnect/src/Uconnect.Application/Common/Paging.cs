using Uconnect.Domain.Common;

namespace Uconnect.Application.Common;

/// <summary>Page request from <c>?page=&amp;pageSize=</c>. Pages are 1-based; page size is clamped to 1..100.</summary>
public sealed record PageRequest(int Page = 1, int PageSize = PageRequest.DefaultPageSize)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public int Skip => (Page - 1) * PageSize;

    public static PageRequest Normalise(int? page, int? pageSize) => new(
        Math.Max(1, page ?? 1),
        Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize));
}

/// <summary>Standard paginated response shape: <c>{ items, page, pageSize, total }</c>.</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);

    public bool HasNext => Page < TotalPages;

    public PagedResult<TOut> Map<TOut>(Func<T, TOut> selector) =>
        new(Items.Select(selector).ToList(), Page, PageSize, Total);

    public static PagedResult<T> Empty(PageRequest request) => new(Array.Empty<T>(), request.Page, request.PageSize, 0);
}

/// <summary>Wire representation of money: integer minor units plus ISO currency.</summary>
public sealed record MoneyDto(long AmountMinor, string Currency)
{
    /// <summary>Convenience display string, e.g. "GBP 34.99". Clients should format from minor units.</summary>
    public string Formatted => Money.FromMinor(AmountMinor, Currency).ToString();
}

public static class MoneyMapping
{
    public static MoneyDto ToDto(this Money money) => new(money.AmountMinor, money.Currency);

    public static MoneyDto? ToDtoOrNull(this Money? money) => money is null ? null : new MoneyDto(money.AmountMinor, money.Currency);

    public static Money ToMoney(this MoneyDto dto) => Money.FromMinor(dto.AmountMinor, dto.Currency);
}

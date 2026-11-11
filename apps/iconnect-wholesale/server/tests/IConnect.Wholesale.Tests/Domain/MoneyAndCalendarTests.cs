using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Domain;

public sealed class MoneyTests
{
    [Theory]
    [InlineData(5, 1_000, 1)]
    [InlineData(-5, 1_000, -1)]
    [InlineData(2_499, 1_250, 312)]
    [InlineData(10_000, 0, 0)]
    public void PercentageOf_rounds_half_away_from_zero(long minor, int bps, long expected) =>
        Assert.Equal(expected, Money.Gbp(minor).PercentageOf(bps).MinorUnits);

    [Fact]
    public void ProRate_clamps_days_to_the_period() =>
        Assert.Equal(3_000, Money.Gbp(3_000).ProRate(31, 30).MinorUnits);

    [Fact]
    public void ProRate_splits_by_days() =>
        Assert.Equal(1_000, Money.Gbp(3_000).ProRate(10, 30).MinorUnits);

    [Fact]
    public void Combining_currencies_is_rejected()
    {
        var ex = Assert.Throws<DomainException>(() => Money.Gbp(100).Add(new Money(100, "EUR")));
        Assert.Equal("money.currency_mismatch", ex.Code);
    }

    [Theory]
    [InlineData("gbp")]
    [InlineData("GB")]
    [InlineData("")]
    public void Currency_must_be_iso_4217(string currency) =>
        Assert.Equal("money.invalid_currency", Assert.Throws<DomainException>(() => new Money(1, currency)).Code);

    [Fact]
    public void Sum_of_nothing_is_zero_in_the_given_currency()
    {
        var total = Money.Sum(Array.Empty<Money>(), "EUR");
        Assert.True(total.IsZero);
        Assert.Equal("EUR", total.Currency);
    }

    [Fact]
    public void ToString_formats_major_units() => Assert.Equal("19.99 GBP", Money.Gbp(1_999).ToString());
}

public sealed class WorkingCalendarTests
{
    // 2024-01-05 is a Friday.
    [Fact]
    public void AddWorkingTime_rolls_over_the_weekend()
    {
        var due = Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 5, 17), TimeSpan.FromHours(2));
        Assert.Equal(Calendars.Utc(2024, 1, 8, 9), due);
    }

    [Fact]
    public void AddWorkingTime_starting_out_of_hours_begins_at_next_window()
    {
        var due = Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 8, 6), TimeSpan.FromHours(1));
        Assert.Equal(Calendars.Utc(2024, 1, 8, 9), due);
    }

    [Fact]
    public void WorkingTimeBetween_counts_only_windows()
    {
        var elapsed = Calendars.Business().WorkingTimeBetween(Calendars.Utc(2024, 1, 5, 16), Calendars.Utc(2024, 1, 8, 10));
        Assert.Equal(TimeSpan.FromHours(4), elapsed);
    }

    [Fact]
    public void WorkingTimeBetween_is_zero_when_reversed() =>
        Assert.Equal(TimeSpan.Zero, Calendars.Business().WorkingTimeBetween(Calendars.Utc(2024, 1, 9), Calendars.Utc(2024, 1, 8)));

    [Fact]
    public void AddWorkingDays_skips_weekends_and_holidays()
    {
        var friday = new DateOnly(2024, 1, 5);
        Assert.Equal(new DateOnly(2024, 1, 8), Calendars.Business().AddWorkingDays(friday, 1));
        Assert.Equal(new DateOnly(2024, 1, 9), Calendars.Business(new DateOnly(2024, 1, 8)).AddWorkingDays(friday, 1));
    }

    [Fact]
    public void WorkingDaysBetween_excludes_start_and_includes_end() =>
        Assert.Equal(4, Calendars.Business().WorkingDaysBetween(new DateOnly(2024, 1, 8), new DateOnly(2024, 1, 12)));

    [Fact]
    public void Holidays_are_not_working_days()
    {
        var christmas = new DateOnly(2024, 12, 25);
        Assert.False(Calendars.Business(christmas).IsWorkingDay(christmas));
        Assert.True(Calendars.AlwaysOn().IsWorkingDay(christmas));
    }

    [Fact]
    public void Nominal_day_length_reflects_the_widest_window()
    {
        Assert.Equal(TimeSpan.FromHours(10), Calendars.Business().NominalDayLength);
        Assert.Equal(TimeSpan.FromHours(24), Calendars.AlwaysOn().NominalDayLength);
    }

    [Fact]
    public void Negative_durations_are_rejected() =>
        Assert.Throws<DomainException>(() => Calendars.Business().AddWorkingTime(Calendars.Utc(2024, 1, 8), TimeSpan.FromHours(-1)));
}

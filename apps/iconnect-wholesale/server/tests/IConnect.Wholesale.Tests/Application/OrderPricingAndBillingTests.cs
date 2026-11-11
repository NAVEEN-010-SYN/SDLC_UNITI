using IConnect.Wholesale.Application.Billing;
using IConnect.Wholesale.Application.Catalogue;
using IConnect.Wholesale.Application.Orders;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Common;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Services;
using IConnect.Wholesale.Domain.Sla;
using IConnect.Wholesale.Tests.Support;

namespace IConnect.Wholesale.Tests.Application;

public sealed class OrderRequestValidatorTests
{
    private static readonly DateOnly Today = new(2024, 1, 8);

    private static PlaceOrderRequest Request(string type = "PROVIDE", string? product = "FTTP500", Guid? service = null,
        string? authCode = null, DateOnly? requested = null, string uprn = "100012345678", string? care = null) =>
        new("REF-1", type, uprn, product, care, service, authCode, requested ?? Today.AddDays(14));

    private static IReadOnlyList<FieldError> Errors(PlaceOrderRequest request) => OrderRequestValidator.Validate(request, Today).Errors;

    [Fact]
    public void Valid_request_is_normalised()
    {
        var (validated, errors) = OrderRequestValidator.Validate(Request(type: "migrate", product: "fttp900", authCode: "abc123456", uprn: "0042"), Today);

        Assert.Empty(errors);
        Assert.Equal(OrderType.Migrate, validated!.Type);
        Assert.Equal("42", validated.Uprn);
        Assert.Equal("FTTP900", validated.ProductCode);
        Assert.Equal("ABC123456", validated.MigrationAuthCode);
        Assert.Equal(CareLevel.Standard, validated.CareLevel);
    }

    [Fact]
    public void Migrate_needs_a_well_formed_switching_code()
    {
        Assert.Contains(Errors(Request(type: "MIGRATE")), e => e.Field == "migrationAuthCode" && e.Code == "required");
        Assert.Contains(Errors(Request(type: "MIGRATE", authCode: "AB12345")), e => e.Field == "migrationAuthCode" && e.Code == "format");
    }

    [Fact]
    public void Cease_must_reference_a_service_and_no_product()
    {
        var errors = Errors(Request(type: "CEASE"));
        Assert.Contains(errors, e => e.Field == "productCode" && e.Code == "not_allowed");
        Assert.Contains(errors, e => e.Field == "existingServiceId" && e.Code == "required");
    }

    [Fact]
    public void Provide_must_not_reference_a_service() =>
        Assert.Contains(Errors(Request(service: Guid.NewGuid())), e => e.Field == "existingServiceId" && e.Code == "not_allowed");

    [Theory]
    [InlineData(0, "past")]
    [InlineData(-3, "past")]
    [InlineData(OrderRequestValidator.MaxRequestedDateHorizonDays + 1, "too_far")]
    public void Requested_date_must_be_in_the_booking_horizon(int offsetDays, string code) =>
        Assert.Contains(Errors(Request(requested: Today.AddDays(offsetDays))), e => e.Field == "requestedDate" && e.Code == code);

    [Fact]
    public void Unknown_enums_are_reported_without_cascading()
    {
        var errors = Errors(Request(type: "UPGRADE", care: "GOLD"));
        Assert.Contains(errors, e => e.Field == "orderType");
        Assert.Contains(errors, e => e.Field == "careLevel");
        Assert.DoesNotContain(errors, e => e.Field == "productCode");
    }
}

public sealed class PricingCalculationTests
{
    private static (PriceBook Book, PriceBookEntry Entry) Book()
    {
        var book = new PriceBook("2024.1", new DateOnly(2024, 1, 1), "GBP");
        book.AddEntry("FTTP500", CareLevel.Standard, 2_500, 6_000, 3_000, 1_500);
        book.AddTier(100, 500);
        book.AddTier(1_000, 1_000);
        return (book, book.Find("fttp500", CareLevel.Standard)!);
    }

    [Theory]
    [InlineData(10, 0, 2_500)]
    [InlineData(150, 500, 2_375)]
    [InlineData(5_000, 1_000, 2_250)]
    public void Volume_tier_discounts_rental(int activeLines, int expectedBps, long expectedRental)
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, OrderType.Provide, activeLines);

        Assert.Equal(expectedBps, quote.VolumeDiscountBps);
        Assert.Equal(expectedRental, quote.MonthlyRental.MinorUnits);
        Assert.Equal(2_500, quote.ListMonthlyRental.MinorUnits);
    }

    [Theory]
    [InlineData(OrderType.Provide, 6_000, "connection")]
    [InlineData(OrderType.Migrate, 3_000, "migration")]
    [InlineData(OrderType.Modify, 1_500, "modify")]
    public void One_off_charge_follows_order_type_at_list_price(OrderType type, long expected, string label)
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, type, 5_000);
        Assert.Equal(expected, quote.OneOffCharge.MinorUnits);
        Assert.Equal(label, quote.OneOffChargeType);
    }

    [Fact]
    public void Cease_is_free()
    {
        var (book, entry) = Book();
        var quote = PricingService.Calculate(book, entry, OrderType.Cease, 10);
        Assert.True(quote.MonthlyRental.IsZero);
        Assert.True(quote.OneOffCharge.IsZero);
    }

    [Fact]
    public void Duplicate_price_entries_are_rejected()
    {
        var (book, _) = Book();
        Assert.Equal("pricebook.duplicate_entry",
            Assert.Throws<DomainException>(() => book.AddEntry("fttp500", CareLevel.Standard, 1, 1, 1, 1)).Code);
    }
}

public sealed class StatementGeneratorTests
{
    private static readonly WorkingCalendar Calendar = Calendars.Business();
    private readonly StatementGenerator _generator = new(ServiceCreditCalculator.Default());

    private static BillingStatement January() =>
        new("STM-00000001", Guid.NewGuid(), new DateOnly(2024, 1, 1), new DateOnly(2024, 1, 31), "GBP");

    private static StatementInputs Inputs(IReadOnlyList<WholesaleService>? services = null, IReadOnlyList<Order>? completed = null,
        IReadOnlyList<Order>? cancelled = null, IReadOnlyList<Fault>? faults = null) =>
        new(services ?? Array.Empty<WholesaleService>(), completed ?? Array.Empty<Order>(), cancelled ?? Array.Empty<Order>(),
            faults ?? Array.Empty<Fault>());

    [Fact]
    public void Mid_month_activation_is_pro_rated()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(3_100), new DateOnly(2024, 1, 11));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        var line = Assert.Single(statement.Lines);
        Assert.Equal(ChargeType.Rental, line.Type);
        Assert.Equal(2_100, line.Amount.MinorUnits);
        Assert.Equal(21, line.Quantity);
        Assert.Contains("(21/31 days)", line.Description, StringComparison.Ordinal);
    }

    [Fact]
    public void Product_change_bills_each_rate_for_its_days()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(3_100), new DateOnly(2023, 6, 1));
        service.ChangeProduct("FTTP900", CareLevel.Standard, Money.Gbp(6_200), new DateOnly(2024, 1, 21));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        Assert.Equal(new long[] { 2_000, 2_200 }, statement.Lines.Select(l => l.Amount.MinorUnits));
        Assert.Equal(4_200, statement.Total.MinorUnits);
    }

    [Fact]
    public void Full_month_rental_is_not_pro_rated()
    {
        var service = new WholesaleService("SVC-1", Guid.NewGuid(), "12345", "FTTP500", CareLevel.Standard, Money.Gbp(2_999), new DateOnly(2023, 6, 1));
        var statement = January();

        _generator.Populate(statement, Inputs(services: new[] { service }), Calendar);

        Assert.Equal(2_999, Assert.Single(statement.Lines).Amount.MinorUnits);
    }

    [Fact]
    public void Late_completion_adds_connection_charge_and_credit()
    {
        var order = Orders.Validated(requested: new DateOnly(2024, 1, 10), oneOffMinor: 6_000);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 22));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Complete(Orders.PlacedAt.AddDays(16), new DateOnly(2024, 1, 24), Guid.NewGuid(), "agent");
        var statement = January();

        _generator.Populate(statement, Inputs(completed: new[] { order }), Calendar);

        Assert.Collection(statement.Lines,
            l => Assert.Equal((ChargeType.Connection, 6_000L), (l.Type, l.Amount.MinorUnits)),
            l => Assert.Equal((ChargeType.LateDeliveryCredit, -500L), (l.Type, l.Amount.MinorUnits)));
    }

    [Fact]
    public void Cancellation_after_dispatch_is_charged()
    {
        var order = Orders.Validated(oneOffMinor: 4_500);
        order.BookAppointment(Guid.NewGuid(), new DateOnly(2024, 1, 15));
        order.StartProvisioning(Orders.PlacedAt.AddDays(1), "agent");
        order.Cancel(Orders.PlacedAt.AddDays(2), "end customer moved", "partner");
        var statement = January();

        _generator.Populate(statement, Inputs(cancelled: new[] { order }), Calendar);

        var line = Assert.Single(statement.Lines);
        Assert.Equal(ChargeType.CancellationCharge, line.Type);
        Assert.Equal(4_500, line.Amount.MinorUnits);
    }

    [Fact]
    public void Csv_export_neutralises_formula_injection()
    {
        Assert.Equal("'=HYPERLINK(1)", BillingService.Escape("=HYPERLINK(1)"));
        Assert.Equal("\"a, \"\"b\"\"\"", BillingService.Escape("a, \"b\""));
        Assert.Equal("plain", BillingService.Escape("plain"));
    }
}

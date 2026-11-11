using Uconnect.Domain.Accounts;
using Uconnect.Domain.Billing;
using Uconnect.Domain.Catalog;
using Uconnect.Domain.Common;
using Uconnect.Domain.Payments;
using Uconnect.Domain.Services;

namespace Uconnect.Tests;

/// <summary>Builders for valid domain objects; tests override only what they assert on.</summary>
internal static class TestData
{
    public static readonly DateTimeOffset Now = new(2026, 11, 11, 10, 0, 0, TimeSpan.Zero);

    public static DateOnly Today => DateOnly.FromDateTime(Now.UtcDateTime);

    public static Money Gbp(long minor) => Money.FromMinor(minor, "GBP");

    public static Account Account(AccountType type = AccountType.Consumer, int billingDay = 1) => new(
        Guid.NewGuid(),
        AccountNumber.Parse("ACC-00000001"),
        "Test Household",
        type,
        EmailAddress.Create("bills@example.com"),
        PhoneNumber.Create("07700 900123"),
        new PostalAddress("1 Fibre Street", null, "Leeds", "LS1 4AP"),
        "GBP",
        billingDay,
        Now.AddYears(-1));

    public static Plan Plan(string code = "FIBRE-500", int tier = 2, long priceMinor = 40_00, int minimumTermMonths = 18) => new(
        Guid.NewGuid(), code, code, ProductType.Broadband, tier, Gbp(priceMinor), 500, 75, minimumTermMonths, Gbp(0), true, true);

    public static Service ActiveService(Account account, Plan plan, DateOnly activatedOn)
    {
        var service = new Service(Guid.NewGuid(), account.Id, "SVC-00000001", plan, new PostalAddress("1 Fibre Street", null, "Leeds", "LS1 4AP"), Now.AddYears(-1));
        service.Activate(activatedOn, Now);
        return service;
    }

    /// <summary>An issued invoice for <paramref name="netMinor"/> + 20% VAT, due 14 days after <paramref name="issuedOn"/>.</summary>
    public static Invoice IssuedInvoice(Guid accountId, long netMinor, DateOnly issuedOn, string number = "INV-202611-000001")
    {
        var period = BillingPeriod.Containing(issuedOn, issuedOn.Day > 28 ? 28 : issuedOn.Day);
        var invoice = new Invoice(Guid.NewGuid(), number, accountId, period, "GBP", Now);
        invoice.AddLine(InvoiceLineType.Recurring, "Fibre 500 monthly charge", Gbp(netMinor));
        invoice.Issue(issuedOn, 14, TaxCalculator.UkStandardVatBasisPoints, Now);
        return invoice;
    }

    public static PaymentMethod Card(Guid accountId) =>
        PaymentMethod.CreateCard(Guid.NewGuid(), accountId, "tok_visa_4242", "Visa", "4242", 12, 2030, Today, Now);
}

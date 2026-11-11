using IConnect.Wholesale.Application.Common;
using IConnect.Wholesale.Domain.Appointments;
using IConnect.Wholesale.Domain.Billing;
using IConnect.Wholesale.Domain.Catalogue;
using IConnect.Wholesale.Domain.Faults;
using IConnect.Wholesale.Domain.Network;
using IConnect.Wholesale.Domain.Orders;
using IConnect.Wholesale.Domain.Partners;
using IConnect.Wholesale.Domain.Services;

namespace IConnect.Wholesale.Application.Abstractions;

public interface IPremiseRepository
{
    Task<Premise?> GetByUprnAsync(string uprn, CancellationToken ct);

    Task<IReadOnlyList<Premise>> SearchByPostcodeAsync(string postcode, CancellationToken ct);
}

public interface ICatalogueRepository
{
    Task<IReadOnlyList<WholesaleProduct>> ListProductsAsync(bool includeWithdrawn, CancellationToken ct);

    Task<WholesaleProduct?> GetProductAsync(string code, CancellationToken ct);

    Task<PriceBook?> GetEffectivePriceBookAsync(DateOnly onDate, CancellationToken ct);

    Task<IReadOnlyList<PriceBook>> ListPriceBooksAsync(CancellationToken ct);

    Task AddPriceBookAsync(PriceBook priceBook, CancellationToken ct);
}

public sealed record OrderQuery(
    Guid PartnerId,
    OrderStatus? Status,
    OrderType? Type,
    string? Search,
    DateOnly? CreatedFrom,
    DateOnly? CreatedTo,
    PageRequest Page);

public interface IOrderRepository
{
    Task<Order?> GetAsync(Guid id, CancellationToken ct);

    Task<Order?> GetByPartnerReferenceAsync(Guid partnerId, string partnerReference, CancellationToken ct);

    Task<PagedResult<Order>> QueryAsync(OrderQuery query, CancellationToken ct);

    Task<int> CountOpenAsync(Guid partnerId, CancellationToken ct);

    Task<bool> HasOpenOrderForUprnAsync(string uprn, CancellationToken ct);

    Task<IReadOnlyList<Order>> ListWithRunningClocksAsync(CancellationToken ct);

    Task<IReadOnlyList<Order>> ListCompletedBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task<IReadOnlyList<Order>> ListCancelledWithChargeBetweenAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task AddAsync(Order order, CancellationToken ct);

    Task AddRangeAsync(IEnumerable<Order> orders, CancellationToken ct);
}

public interface IServiceRepository
{
    Task<WholesaleService?> GetAsync(Guid id, CancellationToken ct);

    Task<WholesaleService?> GetActiveByUprnAsync(string uprn, CancellationToken ct);

    Task<int> CountActiveAsync(Guid partnerId, CancellationToken ct);

    Task<IReadOnlyList<WholesaleService>> ListBillableAsync(Guid partnerId, DateOnly from, DateOnly to, CancellationToken ct);

    Task AddAsync(WholesaleService service, CancellationToken ct);
}

public sealed record FaultQuery(Guid PartnerId, FaultStatus? Status, FaultPriority? Priority, PageRequest Page);

public interface IFaultRepository
{
    Task<Fault?> GetAsync(Guid id, CancellationToken ct);

    Task<PagedResult<Fault>> QueryAsync(FaultQuery query, CancellationToken ct);

    Task<bool> HasOpenFaultForServiceAsync(Guid serviceId, CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListWithRunningClocksAsync(CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListResolvedWithCreditBetweenAsync(Guid partnerId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);

    Task<IReadOnlyList<Fault>> ListAutoCloseCandidatesAsync(DateTimeOffset resolvedBefore, CancellationToken ct);

    Task AddAsync(Fault fault, CancellationToken ct);
}

public interface IAppointmentSlotRepository
{
    Task<AppointmentSlot?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<AppointmentSlot>> ListAsync(string exchangeCode, DateOnly from, DateOnly to, CancellationToken ct);
}

public interface IPartnerRepository
{
    Task<Partner?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Partner>> ListActiveAsync(CancellationToken ct);
}

public interface IApiKeyRepository
{
    Task<ApiKey?> GetAsync(Guid id, CancellationToken ct);

    Task<ApiKey?> GetByPrefixAsync(string prefix, CancellationToken ct);

    Task<IReadOnlyList<ApiKey>> ListForPartnerAsync(Guid partnerId, CancellationToken ct);

    Task AddAsync(ApiKey key, CancellationToken ct);
}

public interface IStatementRepository
{
    Task<BillingStatement?> GetAsync(Guid id, CancellationToken ct);

    Task<BillingStatement?> GetForPeriodAsync(Guid partnerId, DateOnly periodStart, CancellationToken ct);

    Task<PagedResult<BillingStatement>> ListForPartnerAsync(Guid partnerId, PageRequest page, CancellationToken ct);

    Task AddAsync(BillingStatement statement, CancellationToken ct);
}

public interface IDisputeRepository
{
    Task<Dispute?> GetAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<Dispute>> ListForStatementAsync(Guid statementId, CancellationToken ct);

    Task<IReadOnlyList<Dispute>> ListForPartnerAsync(Guid partnerId, CancellationToken ct);

    Task AddAsync(Dispute dispute, CancellationToken ct);
}

public interface IBulkUploadRepository
{
    Task<BulkUpload?> GetAsync(Guid id, CancellationToken ct);

    Task<BulkUpload?> GetByHashAsync(Guid partnerId, string contentSha256, CancellationToken ct);

    Task AddAsync(BulkUpload upload, CancellationToken ct);
}

public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken ct);
}

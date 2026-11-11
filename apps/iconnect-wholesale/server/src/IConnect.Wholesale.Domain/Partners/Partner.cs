using System.Text.RegularExpressions;
using IConnect.Wholesale.Domain.Common;

namespace IConnect.Wholesale.Domain.Partners;

public enum PartnerStatus
{
    Active,
    Suspended,
    Terminated,
}

/// <summary>A wholesale partner (ISP). Its billing account follows the ACC-######## format.</summary>
public sealed partial class Partner : Entity
{
    private Partner()
    {
    }

    public Partner(string name, string accountNumber, string currency, int creditLimitOrders)
    {
        if (!AccountNumberPattern().IsMatch(accountNumber))
        {
            throw new DomainException("partner.invalid_account", $"'{accountNumber}' is not a valid account number (ACC-########).");
        }

        Name = name;
        AccountNumber = accountNumber;
        Currency = currency;
        MaxOpenOrders = creditLimitOrders;
        Status = PartnerStatus.Active;
    }

    public string Name { get; private set; } = string.Empty;

    public string AccountNumber { get; private set; } = string.Empty;

    public string Currency { get; private set; } = "GBP";

    public PartnerStatus Status { get; private set; }

    /// <summary>Commercial limit on concurrent in-flight orders (credit/forecast control).</summary>
    public int MaxOpenOrders { get; private set; }

    public bool CanTrade => Status == PartnerStatus.Active;

    public void Suspend() => Status = Status == PartnerStatus.Terminated
        ? throw new DomainException("partner.terminated", "Terminated partners cannot be suspended.")
        : PartnerStatus.Suspended;

    public void Reinstate() => Status = Status == PartnerStatus.Terminated
        ? throw new DomainException("partner.terminated", "Terminated partners cannot be reinstated.")
        : PartnerStatus.Active;

    [GeneratedRegex("^ACC-[0-9]{8}$")]
    private static partial Regex AccountNumberPattern();
}

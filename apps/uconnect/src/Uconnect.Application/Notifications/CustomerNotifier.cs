using System.Net;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.Common;
using Uconnect.Domain.Accounts;

namespace Uconnect.Application.Notifications;

/// <summary>A customer-facing message rendered once and delivered as HTML and plain-text e-mail, and optionally SMS.</summary>
public sealed record CustomerMessage(string Subject, IReadOnlyList<string> Paragraphs, string? PortalPath = null, string? SmsText = null);

/// <summary>
/// Sends notifications to an account's billing contact. Delivery is best effort: a failing mail or
/// SMS provider is logged and never rolls back the business change that triggered the message.
/// </summary>
public sealed class CustomerNotifier
{
    private readonly IEmailSender _email;
    private readonly ISmsSender _sms;
    private readonly PortalOptions _portal;
    private readonly ILogger<CustomerNotifier> _logger;

    public CustomerNotifier(IEmailSender email, ISmsSender sms, IOptions<PortalOptions> portal, ILogger<CustomerNotifier> logger)
    {
        _email = email;
        _sms = sms;
        _portal = portal.Value;
        _logger = logger;
    }

    /// <summary>E-mails the billing contact. Returns true when the provider accepted the message.</summary>
    public async Task<bool> EmailAsync(Account account, CustomerMessage message, CancellationToken ct)
    {
        var link = message.PortalPath is null ? null : $"{_portal.BaseUrl.TrimEnd('/')}/{message.PortalPath.TrimStart('/')}";
        var greeting = $"Hello {account.Name},";
        var footer = $"If you have any questions call us on {_portal.SupportPhone}. Account {account.Number}.";

        var text = string.Join("\n\n", new[] { greeting }.Concat(message.Paragraphs).Append(link ?? string.Empty).Append(footer).Where(p => p.Length > 0));
        var html = string.Concat(
            $"<p>{WebUtility.HtmlEncode(greeting)}</p>",
            string.Concat(message.Paragraphs.Select(p => $"<p>{WebUtility.HtmlEncode(p)}</p>")),
            link is null ? string.Empty : $"<p><a href=\"{WebUtility.HtmlEncode(link)}\">View in Uconnect</a></p>",
            $"<p><small>{WebUtility.HtmlEncode(footer)}</small></p>");

        try
        {
            await _email.SendAsync(new EmailMessage(account.BillingEmail.Value, message.Subject, html, text), ct);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "E-mail '{Subject}' to account {AccountNumber} could not be sent", message.Subject, account.Number);
            return false;
        }
    }

    /// <summary>Sends the SMS variant when the account has opted into SMS alerts and has a phone number.</summary>
    public async Task<bool> SmsAsync(Account account, CustomerMessage message, CancellationToken ct)
    {
        if (!account.OutageSmsAlerts || account.Phone is null || string.IsNullOrWhiteSpace(message.SmsText))
        {
            return false;
        }

        try
        {
            await _sms.SendAsync(account.Phone, message.SmsText, ct);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "SMS to account {AccountNumber} could not be sent", account.Number);
            return false;
        }
    }
}

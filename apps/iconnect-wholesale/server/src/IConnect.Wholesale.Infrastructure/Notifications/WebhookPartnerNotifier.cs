using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IConnect.Wholesale.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace IConnect.Wholesale.Infrastructure.Notifications;

public sealed class WebhookOptions
{
    public const string Section = "PartnerWebhooks";

    /// <summary>Event gateway that fans notifications out to each partner's registered endpoint. Empty disables delivery.</summary>
    public string? GatewayUrl { get; set; }

    /// <summary>HMAC-SHA256 key used to sign payloads; supplied via environment (PartnerWebhooks__SigningSecret).</summary>
    public string? SigningSecret { get; set; }

    public int TimeoutSeconds { get; set; } = 10;
}

/// <summary>
/// Delivers partner events to the notification gateway as a signed JSON envelope. The signature
/// header (<c>X-Signature: t=unix,v1=hex</c>) binds the timestamp to the body so receivers can
/// reject replays. Delivery is best-effort here; retries are owned by the gateway.
/// </summary>
internal sealed class WebhookPartnerNotifier : IPartnerNotifier
{
    public const string ClientName = "partner-webhooks";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClients;
    private readonly IOptionsMonitor<WebhookOptions> _options;
    private readonly IClock _clock;
    private readonly ILogger<WebhookPartnerNotifier> _logger;

    public WebhookPartnerNotifier(IHttpClientFactory httpClients, IOptionsMonitor<WebhookOptions> options, IClock clock,
        ILogger<WebhookPartnerNotifier> logger)
    {
        _httpClients = httpClients;
        _options = options;
        _clock = clock;
        _logger = logger;
    }

    public async Task NotifyAsync(Guid partnerId, string eventType, object payload, CancellationToken ct)
    {
        var options = _options.CurrentValue;
        if (string.IsNullOrWhiteSpace(options.GatewayUrl))
        {
            _logger.LogInformation("Webhook delivery disabled; event {EventType} for partner {PartnerId} not sent", eventType, partnerId);
            return;
        }

        if (string.IsNullOrEmpty(options.SigningSecret))
        {
            throw new InvalidOperationException("PartnerWebhooks:SigningSecret must be configured when a gateway URL is set.");
        }

        var now = _clock.UtcNow;
        var envelope = new
        {
            id = Guid.NewGuid(),
            type = eventType,
            partnerId,
            occurredAt = now.UtcDateTime,
            data = payload,
        };
        var body = JsonSerializer.Serialize(envelope, Json);

        using var request = new HttpRequestMessage(HttpMethod.Post, options.GatewayUrl)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-Signature", Sign(options.SigningSecret, now.ToUnixTimeSeconds(), body));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var client = _httpClients.CreateClient(ClientName);
        client.Timeout = TimeSpan.FromSeconds(Math.Clamp(options.TimeoutSeconds, 1, 60));
        using var response = await client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Webhook gateway returned {StatusCode} for {EventType} to partner {PartnerId}",
                (int)response.StatusCode, eventType, partnerId);
        }
    }

    internal static string Sign(string secret, long unixSeconds, string body)
    {
        var material = Encoding.UTF8.GetBytes(unixSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture) + "." + body);
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), material);
        return $"t={unixSeconds},v1={Convert.ToHexString(mac).ToLowerInvariant()}";
    }
}

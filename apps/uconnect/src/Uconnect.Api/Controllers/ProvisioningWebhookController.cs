using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Uconnect.Application.Abstractions;
using Uconnect.Application.PlanChanges;
using Uconnect.Infrastructure.External;

namespace Uconnect.Api.Controllers;

/// <summary>Shared secret for provisioning callbacks (section <c>Uconnect:Webhooks</c>, value from the environment).</summary>
public sealed class WebhookOptions
{
    public const string SectionName = "Uconnect:Webhooks";

    public string ProvisioningSecret { get; set; } = string.Empty;

    /// <summary>Callbacks whose timestamp is older than this are rejected to stop replays.</summary>
    public int MaxAgeSeconds { get; set; } = 300;
}

/// <summary>
/// Provisioning order status callbacks. The OSS signs <c>{timestamp}.{body}</c> with HMAC-SHA256 and sends
/// it in <c>X-Signature</c> with the timestamp in <c>X-Timestamp</c> (Unix seconds).
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/v1/webhooks/provisioning")]
public sealed class ProvisioningWebhookController : ControllerBase
{
    private readonly PlanChangeProcessor _processor;
    private readonly WebhookOptions _options;
    private readonly TimeProvider _time;

    public ProvisioningWebhookController(PlanChangeProcessor processor, IOptions<WebhookOptions> options, TimeProvider time)
    {
        _processor = processor;
        _options = options.Value;
        _time = time;
    }

    [HttpPost]
    public async Task<IActionResult> Receive([FromHeader(Name = "X-Signature")] string? signature, [FromHeader(Name = "X-Timestamp")] long? timestamp, CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync(ct);

        if (!IsAuthentic(body, signature, timestamp, _options, _time.GetUtcNow()))
        {
            return Unauthorized();
        }

        var status = JsonSerializer.Deserialize<ProvisioningOrderStatus>(body, ExternalHttp.SerializerOptions);
        if (status is null || string.IsNullOrWhiteSpace(status.OrderRef))
        {
            return BadRequest();
        }

        await _processor.HandleCallbackAsync(status, ct);
        return NoContent();
    }

    internal static bool IsAuthentic(string body, string? signature, long? timestamp, WebhookOptions options, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(options.ProvisioningSecret) || string.IsNullOrEmpty(signature) || timestamp is null)
        {
            return false;
        }

        if (Math.Abs(now.ToUnixTimeSeconds() - timestamp.Value) > options.MaxAgeSeconds)
        {
            return false;
        }

        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(options.ProvisioningSecret), Encoding.UTF8.GetBytes($"{timestamp}.{body}"));
        byte[] provided;
        try
        {
            provided = Convert.FromHexString(signature);
        }
        catch (FormatException)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expected, provided);
    }
}

using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Uconnect.Application.Common;

namespace Uconnect.Infrastructure.External;

/// <summary>Connection settings for one downstream system. The API key comes from the environment, never from appsettings.json.</summary>
public sealed class ExternalEndpointOptions
{
    [Required]
    [Url]
    public string BaseUrl { get; set; } = string.Empty;

    [Required]
    public string ApiKey { get; set; } = string.Empty;

    [Range(1, 120)]
    public int TimeoutSeconds { get; set; } = 15;
}

/// <summary>Names of the configured downstream systems (sections under <c>Uconnect:External</c>).</summary>
public static class ExternalSystems
{
    public const string SectionPrefix = "Uconnect:External";
    public const string Provisioning = "Provisioning";
    public const string PaymentGateway = "PaymentGateway";
    public const string BillingSystem = "BillingSystem";
    public const string FieldService = "FieldService";
    public const string Notifications = "Notifications";
}

/// <summary>Correlation id of the current logical operation, set by the API middleware or a background job.</summary>
public static class CorrelationContext
{
    public const string HeaderName = "X-Correlation-Id";

    private static readonly AsyncLocal<string?> Current = new();

    public static string? CorrelationId
    {
        get => Current.Value;
        set => Current.Value = value;
    }
}

/// <summary>Adds the API key and propagates the correlation id on every outbound call to a downstream system.</summary>
internal sealed class DownstreamHeadersHandler : DelegatingHandler
{
    private readonly IOptionsMonitor<ExternalEndpointOptions> _options;
    private readonly string _system;

    public DownstreamHeadersHandler(IOptionsMonitor<ExternalEndpointOptions> options, string system)
    {
        _options = options;
        _system = system;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        request.Headers.TryAddWithoutValidation("X-Api-Key", _options.Get(_system).ApiKey);
        if (CorrelationContext.CorrelationId is { } correlationId)
        {
            request.Headers.TryAddWithoutValidation(CorrelationContext.HeaderName, correlationId);
        }

        return base.SendAsync(request, cancellationToken);
    }
}

/// <summary>
/// Shared request/response handling for downstream JSON APIs. Network errors, timeouts, 408, 429 and
/// 5xx become transient <see cref="ExternalServiceException"/>s (callers may retry later); other
/// non-success codes are permanent.
/// </summary>
internal static class ExternalHttp
{
    public static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, string system, HttpRequestMessage request, CancellationToken ct, params HttpStatusCode[] acceptedErrors)
    {
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (HttpRequestException ex)
        {
            throw new ExternalServiceException(system, $"{system} could not be reached.", isTransient: true, ex);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            throw new ExternalServiceException(system, $"{system} did not respond in time.", isTransient: true, ex);
        }

        if (response.IsSuccessStatusCode || acceptedErrors.Contains(response.StatusCode))
        {
            return response;
        }

        var status = (int)response.StatusCode;
        var transient = status >= 500 || response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests;
        response.Dispose();
        throw new ExternalServiceException(system, $"{system} returned HTTP {status} for {request.Method} {request.RequestUri?.AbsolutePath}.", transient);
    }

    public static HttpRequestMessage Json<T>(HttpMethod method, string path, T body) =>
        new(method, path) { Content = JsonContent.Create(body, options: SerializerOptions) };

    public static async Task<T> ReadAsync<T>(HttpResponseMessage response, string system, CancellationToken ct)
    {
        using (response)
        {
            try
            {
                return await response.Content.ReadFromJsonAsync<T>(SerializerOptions, ct)
                    ?? throw new ExternalServiceException(system, $"{system} returned an empty response.", isTransient: false);
            }
            catch (JsonException ex)
            {
                throw new ExternalServiceException(system, $"{system} returned an unreadable response.", isTransient: false, ex);
            }
        }
    }
}

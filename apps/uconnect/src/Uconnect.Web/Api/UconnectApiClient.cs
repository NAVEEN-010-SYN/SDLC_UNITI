using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;

namespace Uconnect.Web.Api;

/// <summary>An RFC 7807 problem returned by the API, surfaced to pages as validation messages.</summary>
public sealed class ApiProblemException : Exception
{
    public ApiProblemException(HttpStatusCode status, string? code, string message, IReadOnlyDictionary<string, string[]> errors)
        : base(message)
    {
        Status = status;
        Code = code;
        Errors = errors;
    }

    public HttpStatusCode Status { get; }

    public string? Code { get; }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

/// <summary>Forwards the signed-in user's access token and the request's correlation id to the API.</summary>
internal sealed class ApiAuthenticationHandler : DelegatingHandler
{
    private readonly IHttpContextAccessor _accessor;

    public ApiAuthenticationHandler(IHttpContextAccessor accessor) => _accessor = accessor;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (_accessor.HttpContext is { } context)
        {
            var token = await context.GetTokenAsync("access_token");
            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            request.Headers.TryAddWithoutValidation("X-Correlation-Id", context.TraceIdentifier);
        }

        return await base.SendAsync(request, cancellationToken);
    }
}

/// <summary>Typed client for Uconnect.Api. All paths are relative to <c>/api/v1/</c>.</summary>
public sealed class UconnectApiClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly HttpClient _http;

    public UconnectApiClient(HttpClient http) => _http = http;

    public static string Account(string accountNumber, string path = "") =>
        $"accounts/{Uri.EscapeDataString(accountNumber)}/{path}".TrimEnd('/');

    public async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        using var response = await _http.GetAsync(path, ct);
        return await ReadAsync<T>(response, ct);
    }

    public async Task<T> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken ct, string? idempotencyKey = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), options: Json);
        }

        if (idempotencyKey is not null)
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        using var response = await _http.SendAsync(request, ct);
        return await ReadAsync<T>(response, ct);
    }

    public async Task SendAsync(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), options: Json);
        }

        using var response = await _http.SendAsync(request, ct);
        await EnsureSuccessAsync(response, ct);
    }

    public async Task<(byte[] Content, string ContentType, string FileName)> DownloadAsync(string path, CancellationToken ct)
    {
        using var response = await _http.GetAsync(path, ct);
        await EnsureSuccessAsync(response, ct);
        var content = await response.Content.ReadAsByteArrayAsync(ct);
        var fileName = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName ?? "document";
        return (content, response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream", fileName.Trim('"'));
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        await EnsureSuccessAsync(response, ct);
        return await response.Content.ReadFromJsonAsync<T>(Json, ct)
            ?? throw new ApiProblemException(response.StatusCode, null, "The service returned an empty response.", new Dictionary<string, string[]>());
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        ProblemBody? problem = null;
        if (response.Content.Headers.ContentType?.MediaType is "application/problem+json" or "application/json")
        {
            try
            {
                problem = await response.Content.ReadFromJsonAsync<ProblemBody>(Json, ct);
            }
            catch (JsonException)
            {
                problem = null;
            }
        }

        var message = problem?.Detail ?? problem?.Title ?? DefaultMessage(response.StatusCode);
        throw new ApiProblemException(response.StatusCode, problem?.Code, message, problem?.Errors ?? new Dictionary<string, string[]>());
    }

    private static string DefaultMessage(HttpStatusCode status)
    {
        if (status == HttpStatusCode.Unauthorized)
        {
            return "Your session has expired. Please sign in again.";
        }

        if (status == HttpStatusCode.ServiceUnavailable)
        {
            return "This service is temporarily unavailable. Please try again shortly.";
        }

        return "Something went wrong. Please try again.";
    }

    private sealed record ProblemBody(string? Title, string? Detail, string? Code, Dictionary<string, string[]>? Errors);
}

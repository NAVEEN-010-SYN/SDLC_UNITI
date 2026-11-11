# Hosted Services (hosted voice, email, web hosting): apps/hosted-services/app (part 2 of 6)

- **Application:** Hosted Services (hosted voice, email, web hosting)
- **Tech stack:** PHP 8 (Laravel-style)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 44

## Files

- `apps/hosted-services/app/Http/Controllers/Porting/CarrierUpdateController.php` (44 lines)
- `apps/hosted-services/app/Http/Controllers/Porting/PortingController.php` (89 lines)
- `apps/hosted-services/app/Http/Controllers/Voice/ExtensionController.php` (75 lines)
- `apps/hosted-services/app/Http/Controllers/Voice/HuntGroupController.php` (58 lines)
- `apps/hosted-services/app/Http/Controllers/Voice/NumberController.php` (86 lines)
- `apps/hosted-services/app/Http/Controllers/Voice/VoicemailController.php` (44 lines)
- `apps/hosted-services/app/Http/Middleware/AuthenticateJwt.php` (55 lines)
- `apps/hosted-services/app/Http/Middleware/CorrelationId.php` (63 lines)
- `apps/hosted-services/app/Http/Middleware/EnsureAccountAccess.php` (42 lines)
- `apps/hosted-services/app/Http/Middleware/RequireRole.php` (41 lines)
- `apps/hosted-services/app/Http/Requests/ApiFormRequest.php` (113 lines)
- `apps/hosted-services/app/Http/Requests/Hosting/CertificateChangeRequest.php` (46 lines)
- `apps/hosted-services/app/Http/Requests/Hosting/CertificateRequest.php` (39 lines)
- `apps/hosted-services/app/Http/Requests/Hosting/DnsRecordRequest.php` (46 lines)
- `apps/hosted-services/app/Http/Requests/Hosting/HostedDomainRequest.php` (21 lines)
- `apps/hosted-services/app/Http/Requests/Mail/AddonBlocksRequest.php` (29 lines)
- `apps/hosted-services/app/Http/Requests/Mail/EmailDomainRequest.php` (23 lines)
- `apps/hosted-services/app/Http/Requests/Mail/MailAliasRequest.php` (30 lines)
- `apps/hosted-services/app/Http/Requests/Mail/MailboxRequest.php` (39 lines)
- `apps/hosted-services/app/Http/Requests/Porting/CancelPortingRequest.php` (25 lines)
- `apps/hosted-services/app/Http/Requests/Porting/CarrierUpdateRequest.php` (49 lines)
- `apps/hosted-services/app/Http/Requests/Porting/PortingDraftRequest.php` (42 lines)
- `apps/hosted-services/app/Http/Requests/Voice/ConfigureVoicemailRequest.php` (30 lines)
- `apps/hosted-services/app/Http/Requests/Voice/ExtensionRequest.php` (35 lines)
- `apps/hosted-services/app/Http/Requests/Voice/HuntGroupRequest.php` (40 lines)
- `apps/hosted-services/app/Http/Requests/Voice/OrderNumbersRequest.php` (32 lines)
- `apps/hosted-services/app/Http/Requests/Voice/ReplaceForwardingRulesRequest.php` (39 lines)
- `apps/hosted-services/app/Http/Requests/Voice/SearchNumbersRequest.php` (32 lines)
- `apps/hosted-services/app/Http/Requests/Voice/UpdateNumberRequest.php` (39 lines)
- `apps/hosted-services/app/Http/Resources/ApiResource.php` (58 lines)
- `apps/hosted-services/app/Http/Resources/DnsRecordResource.php` (33 lines)
- `apps/hosted-services/app/Http/Resources/EmailDomainResource.php` (40 lines)
- `apps/hosted-services/app/Http/Resources/ExtensionResource.php` (33 lines)
- `apps/hosted-services/app/Http/Resources/ForwardingRuleResource.php` (30 lines)
- `apps/hosted-services/app/Http/Resources/HostedDomainResource.php` (30 lines)
- `apps/hosted-services/app/Http/Resources/HostedNumberResource.php` (33 lines)
- `apps/hosted-services/app/Http/Resources/HuntGroupResource.php` (51 lines)
- `apps/hosted-services/app/Http/Resources/MailAliasResource.php` (28 lines)
- `apps/hosted-services/app/Http/Resources/MailboxResource.php` (41 lines)
- `apps/hosted-services/app/Http/Resources/PortingRequestResource.php` (61 lines)
- `apps/hosted-services/app/Http/Resources/SslCertificateResource.php` (48 lines)
- `apps/hosted-services/app/Http/Resources/VoicemailBoxResource.php` (36 lines)
- `apps/hosted-services/app/Models/BaseModel.php` (32 lines)
- `apps/hosted-services/app/Models/CallForwardingRule.php` (51 lines)

## apps/hosted-services/app/Http/Controllers/Porting/CarrierUpdateController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Porting/CarrierUpdateController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Porting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Porting\CarrierUpdateRequest;
use App\Http\Resources\PortingRequestResource;
use App\Services\Porting\PortingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Internal endpoint used by the portability gateway integration (and by
 * support agents correcting a stuck port). It is not account scoped: the
 * carrier reference identifies the request.
 */
final class CarrierUpdateController extends Controller
{
    public function __construct(private readonly PortingService $porting)
    {
    }

    public function __invoke(CarrierUpdateRequest $request): JsonResponse
    {
        $data = $request->validated();
        $port = $this->porting->applyCarrierUpdate(
            (string) $data['reference'],
            $request->status(),
            $request->focAt(),
            $data['reason'] ?? null,
        );

        Log::info('porting.carrier_update_applied', [
            'portingRequestId' => $port->id,
            'status' => $port->status->value,
            'actor' => $this->principal($request)->auditId(),
        ]);

        return $this->ok((new PortingRequestResource($port))->resolve($request));
    }
}
```

## apps/hosted-services/app/Http/Controllers/Porting/PortingController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Porting/PortingController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Porting;

use App\Enums\PortingStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Porting\CancelPortingRequest;
use App\Http\Requests\Porting\PortingDraftRequest;
use App\Http\Resources\PortingRequestResource;
use App\Models\PortingRequest;
use App\Services\Porting\PortingService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer-facing number port-in lifecycle. Status changes are explicit
 * action endpoints (submit, cancel, reopen) rather than a writable status
 * field, so every move goes through the state machine guards.
 */
final class PortingController extends Controller
{
    public function __construct(private readonly PortingService $porting)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $status = $this->enumQuery($request, 'status', PortingStatus::class);

        return $this->ok(PortingRequestResource::page($this->porting->list($accountId, $page, $pageSize, $status), $request));
    }

    public function show(Request $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->get($accountId, $requestId);
        $port->loadMissing('events');

        return $this->ok($this->present($port, $request));
    }

    public function store(PortingDraftRequest $request, string $accountId): JsonResponse
    {
        $port = $this->porting->createDraft($accountId, $request->validated(), $this->principal($request));

        return $this->created($this->present($port, $request), $this->location($accountId, $port));
    }

    public function update(PortingDraftRequest $request, string $accountId, string $requestId): JsonResponse
    {
        return $this->ok($this->present($this->porting->updateDraft($accountId, $requestId, $request->payload()), $request));
    }

    public function submit(Request $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->submit($accountId, $requestId, $this->principal($request));

        return $this->accepted($this->present($port, $request), $this->location($accountId, $port));
    }

    public function cancel(CancelPortingRequest $request, string $accountId, string $requestId): JsonResponse
    {
        $port = $this->porting->cancel($accountId, $requestId, $this->principal($request), $request->reason());

        return $this->ok($this->present($port, $request));
    }

    public function reopen(Request $request, string $accountId, string $requestId): JsonResponse
    {
        return $this->ok($this->present($this->porting->reopen($accountId, $requestId, $this->principal($request)), $request));
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PortingRequest $port, Request $request): array
    {
        return (new PortingRequestResource($port))->resolve($request);
    }

    private function location(string $accountId, PortingRequest $port): string
    {
        return sprintf('/api/v1/accounts/%s/porting-requests/%s', $accountId, $port->id);
    }
}
```

## apps/hosted-services/app/Http/Controllers/Voice/ExtensionController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Voice/ExtensionController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\ExtensionRequest;
use App\Http\Requests\Voice\ReplaceForwardingRulesRequest;
use App\Http\Resources\ExtensionResource;
use App\Http\Resources\ForwardingRuleResource;
use App\Services\Voice\ExtensionService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class ExtensionController extends Controller
{
    public function __construct(private readonly ExtensionService $extensions)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $result = $this->extensions->list($accountId, $page, $pageSize, $this->stringQuery($request, 'q'));

        return $this->ok(ExtensionResource::page($result, $request));
    }

    public function show(Request $request, string $accountId, string $extensionId): JsonResponse
    {
        return $this->ok((new ExtensionResource($this->extensions->get($accountId, $extensionId)))->resolve($request));
    }

    public function store(ExtensionRequest $request, string $accountId): JsonResponse
    {
        $extension = $this->extensions->create($accountId, $request->payload(), $this->principal($request));

        return $this->created(
            (new ExtensionResource($extension))->resolve($request),
            sprintf('/api/v1/accounts/%s/extensions/%s', $accountId, $extension->id),
        );
    }

    public function update(ExtensionRequest $request, string $accountId, string $extensionId): JsonResponse
    {
        $extension = $this->extensions->update($accountId, $extensionId, $request->payload());

        return $this->ok((new ExtensionResource($extension))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $extensionId): Response
    {
        $this->extensions->delete($accountId, $extensionId, $this->principal($request));

        return $this->noContent();
    }

    public function forwardingRules(Request $request, string $accountId, string $extensionId): JsonResponse
    {
        $rules = $this->extensions->forwardingRules($accountId, $extensionId);

        return $this->ok(['items' => ForwardingRuleResource::list($rules, $request)]);
    }

    public function replaceForwardingRules(ReplaceForwardingRulesRequest $request, string $accountId, string $extensionId): JsonResponse
    {
        $rules = $this->extensions->replaceForwardingRules($accountId, $extensionId, $request->forwardingRules());

        return $this->ok(['items' => ForwardingRuleResource::list($rules, $request)]);
    }
}
```

## apps/hosted-services/app/Http/Controllers/Voice/HuntGroupController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Voice/HuntGroupController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\HuntGroupRequest;
use App\Http\Resources\HuntGroupResource;
use App\Services\Voice\HuntGroupService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class HuntGroupController extends Controller
{
    public function __construct(private readonly HuntGroupService $groups)
    {
    }

    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);

        return $this->ok(HuntGroupResource::page($this->groups->list($accountId, $page, $pageSize), $request));
    }

    public function show(Request $request, string $accountId, string $groupId): JsonResponse
    {
        return $this->ok((new HuntGroupResource($this->groups->get($accountId, $groupId)))->resolve($request));
    }

    public function store(HuntGroupRequest $request, string $accountId): JsonResponse
    {
        $group = $this->groups->create($accountId, $request->validated(), $this->principal($request));

        return $this->created(
            (new HuntGroupResource($group))->resolve($request),
            sprintf('/api/v1/accounts/%s/hunt-groups/%s', $accountId, $group->id),
        );
    }

    public function update(HuntGroupRequest $request, string $accountId, string $groupId): JsonResponse
    {
        $group = $this->groups->update($accountId, $groupId, $request->validated());

        return $this->ok((new HuntGroupResource($group))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $groupId): Response
    {
        $this->groups->delete($accountId, $groupId, $this->principal($request));

        return $this->noContent();
    }
}
```

## apps/hosted-services/app/Http/Controllers/Voice/NumberController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Voice/NumberController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Enums\ProvisioningStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\OrderNumbersRequest;
use App\Http\Requests\Voice\SearchNumbersRequest;
use App\Http\Requests\Voice\UpdateNumberRequest;
use App\Http\Resources\HostedNumberResource;
use App\Services\Voice\NumberService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

final class NumberController extends Controller
{
    public function __construct(private readonly NumberService $numbers)
    {
    }

    /**
     * GET /numbers?status=ACTIVE&assigned=false&contains=555
     */
    public function index(Request $request, string $accountId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $contains = $this->stringQuery($request, 'contains', 15);
        $result = $this->numbers->list(
            $accountId,
            $page,
            $pageSize,
            $this->enumQuery($request, 'status', ProvisioningStatus::class)?->value,
            $this->boolQuery($request, 'assigned'),
            $contains === null ? null : preg_replace('/\D+/', '', $contains),
        );

        return $this->ok(HostedNumberResource::page($result, $request));
    }

    public function available(SearchNumbersRequest $request, string $accountId): JsonResponse
    {
        return $this->ok([
            'npa' => $request->npa(),
            'items' => $this->numbers->searchAvailable($accountId, $request->npa(), $request->quantity()),
        ]);
    }

    /**
     * Partial success is a normal outcome: 201 when every number activated,
     * 207 when some failed so the portal can show a mixed result.
     */
    public function order(OrderNumbersRequest $request, string $accountId): JsonResponse
    {
        $result = $this->numbers->order($accountId, $request->numbers(), $this->principal($request));
        $status = $result['failed'] === [] ? 201 : 207;

        return new JsonResponse([
            'activated' => HostedNumberResource::list($result['activated'], $request),
            'failed' => $result['failed'],
        ], $status);
    }

    public function show(Request $request, string $accountId, string $numberId): JsonResponse
    {
        return $this->ok((new HostedNumberResource($this->numbers->get($accountId, $numberId)))->resolve($request));
    }

    public function update(UpdateNumberRequest $request, string $accountId, string $numberId): JsonResponse
    {
        $number = $this->numbers->update($accountId, $numberId, $request->payload());

        return $this->ok((new HostedNumberResource($number))->resolve($request));
    }

    public function destroy(Request $request, string $accountId, string $numberId): Response
    {
        $this->numbers->release($accountId, $numberId, $this->principal($request));

        return $this->noContent();
    }
}
```

## apps/hosted-services/app/Http/Controllers/Voice/VoicemailController.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Controllers/Voice/VoicemailController.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Voice\ConfigureVoicemailRequest;
use App\Http\Resources\VoicemailBoxResource;
use App\Services\Voice\VoicemailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Voicemail is a singleton sub-resource of an extension: PUT enables or
 * reconfigures it, DELETE disables it.
 */
final class VoicemailController extends Controller
{
    public function __construct(private readonly VoicemailService $voicemail)
    {
    }

    public function show(Request $request, string $accountId, string $extensionId): JsonResponse
    {
        return $this->ok((new VoicemailBoxResource($this->voicemail->get($accountId, $extensionId)))->resolve($request));
    }

    public function update(ConfigureVoicemailRequest $request, string $accountId, string $extensionId): JsonResponse
    {
        $box = $this->voicemail->configure($accountId, $extensionId, $request->payload());

        return $this->ok((new VoicemailBoxResource($box))->resolve($request));
    }

    public function destroy(string $accountId, string $extensionId): Response
    {
        $this->voicemail->disable($accountId, $extensionId);

        return $this->noContent();
    }
}
```

## apps/hosted-services/app/Http/Middleware/AuthenticateJwt.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Middleware/AuthenticateJwt.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\AuthenticationFailedException;
use App\Support\JwtDecoder;
use App\Support\Principal;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires a valid OAuth2 bearer token and attaches the resulting
 * Principal to the request under the "principal" attribute.
 */
final class AuthenticateJwt
{
    public const ATTRIBUTE = 'principal';

    public function __construct(private readonly JwtDecoder $decoder)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if ($token === null || $token === '') {
            throw new AuthenticationFailedException('A bearer token is required.', ['scheme' => 'Bearer']);
        }

        $principal = $this->decoder->decode($token);
        $request->attributes->set(self::ATTRIBUTE, $principal);

        Log::withContext([
            'subject' => $principal->subject,
            'callerAccountId' => $principal->accountId,
        ]);

        return $next($request);
    }

    public static function principal(Request $request): Principal
    {
        $principal = $request->attributes->get(self::ATTRIBUTE);
        if (!$principal instanceof Principal) {
            throw new AuthenticationFailedException('Request is not authenticated.');
        }

        return $principal;
    }
}
```

## apps/hosted-services/app/Http/Middleware/CorrelationId.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Middleware/CorrelationId.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accepts or generates an X-Correlation-Id, exposes it to the logger context
 * and downstream HTTP clients, and echoes it on the response.
 */
final class CorrelationId
{
    public const HEADER = 'X-Correlation-Id';
    public const ATTRIBUTE = 'correlation_id';

    /** Accept caller ids that are UUID-ish or short opaque tokens only. */
    private const ACCEPTED_PATTERN = '/^[A-Za-z0-9._:-]{8,128}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $incoming = $request->headers->get(self::HEADER);
        $correlationId = is_string($incoming) && preg_match(self::ACCEPTED_PATTERN, $incoming) === 1
            ? $incoming
            : (string) Str::uuid();

        $request->attributes->set(self::ATTRIBUTE, $correlationId);
        app()->instance(self::ATTRIBUTE, $correlationId);
        Log::withContext([
            'correlationId' => $correlationId,
            'method' => $request->getMethod(),
            'path' => $request->getPathInfo(),
        ]);

        $startedAt = hrtime(true);

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set(self::HEADER, $correlationId);

        Log::info('request.completed', [
            'status' => $response->getStatusCode(),
            'durationMs' => round((hrtime(true) - $startedAt) / 1_000_000, 2),
        ]);

        return $response;
    }

    /**
     * Current correlation id for code running outside the request object
     * (HTTP clients, queued jobs). Falls back to a fresh id.
     */
    public static function current(): string
    {
        return app()->bound(self::ATTRIBUTE) ? (string) app(self::ATTRIBUTE) : (string) Str::uuid();
    }
}
```

## apps/hosted-services/app/Http/Middleware/EnsureAccountAccess.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Middleware/EnsureAccountAccess.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Exceptions\AccessDeniedException;
use App\Exceptions\ValidationFailedException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces that the {accountId} route parameter is well formed and that the
 * caller is entitled to act on it. Denials are logged for audit.
 */
final class EnsureAccountAccess
{
    public const ACCOUNT_ID_PATTERN = '/^ACC-\d{8}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $accountId = $request->route('accountId');
        if (!is_string($accountId) || preg_match(self::ACCOUNT_ID_PATTERN, $accountId) !== 1) {
            throw ValidationFailedException::forField('accountId', 'Account id must look like ACC-12345678.');
        }

        $principal = AuthenticateJwt::principal($request);
        if (!$principal->canAccessAccount($accountId)) {
            Log::warning('account.access_denied', [
                'requestedAccountId' => $accountId,
                'subject' => $principal->subject,
            ]);

            throw new AccessDeniedException('You do not have access to this account.');
        }

        return $next($request);
    }
}
```

## apps/hosted-services/app/Http/Middleware/RequireRole.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Middleware/RequireRole.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Enums\Role;
use App\Exceptions\AccessDeniedException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware: `role:BUSINESS_ADMIN,SUPPORT_AGENT` or the shorthand
 * `role:manage` meaning "any role allowed to change configuration".
 */
final class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$required): Response
    {
        $principal = AuthenticateJwt::principal($request);

        if ($required === ['manage']) {
            if (!$principal->canManage()) {
                throw new AccessDeniedException('This action requires an administrator role.');
            }

            return $next($request);
        }

        $roles = array_filter(array_map(static fn (string $r) => Role::tryFrom($r), $required));
        if ($roles !== [] && !$principal->hasRole(...$roles)) {
            throw new AccessDeniedException(
                'This action requires one of the roles: ' . implode(', ', $required) . '.',
            );
        }

        return $next($request);
    }
}
```

## apps/hosted-services/app/Http/Requests/ApiFormRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/ApiFormRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\FieldCase;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

/**
 * Base for every JSON body validator.
 *
 * - Authorisation is enforced by route middleware (auth.jwt, account, role),
 *   so authorize() is always true here.
 * - Clients send camelCase; keys are converted to the snake_case attribute
 *   names used by services before validation runs.
 * - Unknown top-level fields are rejected: a typo such as "quotaMB" instead
 *   of "quotaMb" must fail loudly rather than be silently ignored.
 * - Failures raise ValidationException, which ProblemRenderer turns into a
 *   400 application/problem+json document with an "errors" map.
 */
abstract class ApiFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    abstract public function rules(): array;

    protected function prepareForValidation(): void
    {
        $source = $this->isJson() ? $this->json()->all() : $this->query->all();
        $this->replace(FieldCase::snake($source));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $allowed = $this->allowedTopLevelFields();
            foreach (array_keys($this->json()->all()) as $field) {
                if (!in_array((string) $field, $allowed, true)) {
                    $validator->errors()->add((string) $field, 'This field is not recognised.');
                }
            }
        });
    }

    /**
     * Validated input restricted to the keys the client actually sent, so
     * PATCH semantics ("absent" vs "explicit null") survive into services.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        $validated = $this->validated();
        $sent = $this->json()->all();

        return array_intersect_key($validated, $sent);
    }

    /**
     * Derive PATCH rules from create rules: top-level fields become
     * "sometimes" and lose "required"; nested rules are kept as-is so a
     * supplied array is still validated element by element.
     *
     * @param array<string, list<mixed>> $rules
     * @param list<string>               $immutable Fields that may not change after creation.
     * @return array<string, list<mixed>>
     */
    protected static function partial(array $rules, array $immutable = []): array
    {
        $result = [];
        foreach ($rules as $field => $fieldRules) {
            $topLevel = !str_contains($field, '.');
            if ($topLevel && in_array($field, $immutable, true)) {
                $result[$field] = ['prohibited'];
                continue;
            }
            if ($topLevel) {
                $fieldRules = ['sometimes', ...array_values(array_filter($fieldRules, static fn ($r) => $r !== 'required'))];
            }
            $result[$field] = $fieldRules;
        }

        return $result;
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new ValidationException($validator);
    }

    /**
     * @return list<string>
     */
    private function allowedTopLevelFields(): array
    {
        $fields = [];
        foreach (array_keys($this->rules()) as $rule) {
            $fields[] = explode('.', (string) $rule, 2)[0];
        }

        return array_values(array_unique($fields));
    }
}
```

## apps/hosted-services/app/Http/Requests/Hosting/CertificateChangeRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Hosting/CertificateChangeRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * Body for certificate lifecycle actions:
 *  - POST .../certificates/{id}/revoke  { "reason": "KEY_COMPROMISE" }
 *  - PATCH .../certificates/{id}        { "auto_renew": false }
 *
 * Revocation reasons are the RFC 5280 codes a customer may legitimately
 * assert; CA-only reasons (e.g. caCompromise) are not offered.
 */
final class CertificateChangeRequest extends ApiFormRequest
{
    public const REVOCATION_REASONS = [
        'UNSPECIFIED' => 'unspecified',
        'KEY_COMPROMISE' => 'keyCompromise',
        'SUPERSEDED' => 'superseded',
        'CESSATION_OF_OPERATION' => 'cessationOfOperation',
    ];

    public function rules(): array
    {
        if ($this->isMethod('PATCH')) {
            return ['auto_renew' => ['required', 'boolean']];
        }

        return ['reason' => ['required', Rule::in(array_keys(self::REVOCATION_REASONS))]];
    }

    public function rfc5280Reason(): string
    {
        return self::REVOCATION_REASONS[(string) $this->validated()['reason']];
    }

    public function autoRenew(): bool
    {
        return (bool) $this->validated()['auto_renew'];
    }
}
```

## apps/hosted-services/app/Http/Requests/Hosting/CertificateRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Hosting/CertificateRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /domains/{id}/certificates orders a DNS-01 validated certificate.
 */
final class CertificateRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $maxSans = (int) config('hosted.ssl.max_sans', 20);

        return [
            'common_name' => ['required', 'string', 'max:253'],
            'subject_alt_names' => ['sometimes', 'array', 'list', 'max:' . $maxSans],
            'subject_alt_names.*' => ['required', 'string', 'max:253', 'distinct:ignore_case'],
            'auto_renew' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return list<string>
     */
    public function subjectAltNames(): array
    {
        return array_values($this->validated()['subject_alt_names'] ?? []);
    }

    public function autoRenew(): bool
    {
        return (bool) ($this->validated()['auto_renew'] ?? true);
    }
}
```

## apps/hosted-services/app/Http/Requests/Hosting/DnsRecordRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Hosting/DnsRecordRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Enums\DnsRecordType;
use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * Shape validation for DNS records. RDATA semantics (address families,
 * CNAME exclusivity, TXT length, zone limits) belong to DnsRecordValidator.
 * The record type is fixed after creation: changing it is delete + create.
 */
final class DnsRecordRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $customerTypes = array_values(array_filter(
            DnsRecordType::cases(),
            static fn (DnsRecordType $t) => $t->isCustomerManaged(),
        ));

        $rules = [
            'name' => ['nullable', 'string', 'max:253'],
            'type' => ['required', Rule::in(array_map(static fn (DnsRecordType $t) => $t->value, $customerTypes))],
            'value' => ['required', 'string', 'max:4000'],
            'ttl' => ['nullable', 'integer'],
            'priority' => ['nullable', 'integer', 'between:0,65535'],
            'weight' => ['nullable', 'integer', 'between:0,65535'],
            'port' => ['nullable', 'integer', 'between:0,65535'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules, immutable: ['type']) : $rules;
    }

    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if (is_string($this->input('type'))) {
            $this->merge(['type' => strtoupper($this->input('type'))]);
        }
    }
}
```

## apps/hosted-services/app/Http/Requests/Hosting/HostedDomainRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Hosting/HostedDomainRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Hosting;

use App\Http\Requests\ApiFormRequest;
use App\Services\Hosting\DomainService;
use Illuminate\Validation\Rule;

final class HostedDomainRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:253'],
            'hosting_plan' => ['required', Rule::in(DomainService::PLANS)],
        ];
    }
}
```

## apps/hosted-services/app/Http/Requests/Mail/AddonBlocksRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Mail/AddonBlocksRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * PUT /email-domains/{id}/storage — sets the absolute number of purchased
 * add-on storage blocks (not a delta, so retries are idempotent).
 */
final class AddonBlocksRequest extends ApiFormRequest
{
    public const MAX_BLOCKS = 500;

    public function rules(): array
    {
        return [
            'addon_blocks' => ['required', 'integer', 'min:0', 'max:' . self::MAX_BLOCKS],
        ];
    }

    public function blocks(): int
    {
        return (int) $this->validated()['addon_blocks'];
    }
}
```

## apps/hosted-services/app/Http/Requests/Mail/EmailDomainRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Mail/EmailDomainRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /email-domains registers a domain on a hosted email plan.
 */
final class EmailDomainRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'domain' => ['required', 'string', 'max:253'],
            'plan_code' => ['required', 'string', Rule::in(array_keys((array) config('hosted.mail.plans')))],
        ];
    }
}
```

## apps/hosted-services/app/Http/Requests/Mail/MailAliasRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Mail/MailAliasRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * Aliases deliver to one or more destinations. Destinations may be bare
 * local parts (resolved within the domain) or full addresses; the service
 * decides whether external forwarding is allowed.
 */
final class MailAliasRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $max = (int) config('hosted.mail.max_alias_destinations', 50);

        $rules = [
            'local_part' => ['required', 'string', 'max:64'],
            'destinations' => ['required', 'array', 'list', 'min:1', 'max:' . $max],
            'destinations.*' => ['required', 'string', 'max:254', 'distinct:ignore_case'],
            'description' => ['nullable', 'string', 'max:200'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules, immutable: ['local_part']) : $rules;
    }
}
```

## apps/hosted-services/app/Http/Requests/Mail/MailboxRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Mail/MailboxRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Mail;

use App\Http\Requests\ApiFormRequest;

/**
 * POST creates a mailbox; PATCH changes quota, forwarding or suspension.
 * The address (local part) cannot be renamed in place because mail clients
 * and the platform key on it; customers create a new mailbox plus an alias.
 */
final class MailboxRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $quotaMin = (int) config('hosted.mail.min_mailbox_quota_mb', 512);
        $quotaMax = (int) config('hosted.mail.max_mailbox_quota_mb', 102400);

        $rules = [
            'local_part' => ['required', 'string', 'max:64'],
            'display_name' => ['required', 'string', 'min:1', 'max:120'],
            'quota_mb' => ['nullable', 'integer', "between:$quotaMin,$quotaMax"],
        ];

        if (!$this->isMethod('PATCH')) {
            return $rules;
        }

        return self::partial($rules + [
            'forwarding_enabled' => ['boolean'],
            'forwarding_address' => ['nullable', 'string', 'email:rfc', 'max:254', 'required_if:forwarding_enabled,true'],
            'keep_forwarded_copy' => ['boolean'],
            'suspended' => ['boolean'],
        ], immutable: ['local_part']);
    }
}
```

## apps/hosted-services/app/Http/Requests/Porting/CancelPortingRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Porting/CancelPortingRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Http\Requests\ApiFormRequest;

final class CancelPortingRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'reason' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function reason(): ?string
    {
        $reason = $this->validated()['reason'] ?? null;

        return $reason === null || trim($reason) === '' ? null : trim($reason);
    }
}
```

## apps/hosted-services/app/Http/Requests/Porting/CarrierUpdateRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Porting/CarrierUpdateRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Enums\PortingStatus;
use App\Http\Requests\ApiFormRequest;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;

/**
 * Status update relayed from the number portability gateway. Only the
 * statuses a carrier can drive are accepted; DRAFT/SUBMITTED/CANCELLED are
 * customer-driven.
 */
final class CarrierUpdateRequest extends ApiFormRequest
{
    private const CARRIER_STATUSES = [
        PortingStatus::PendingFoc,
        PortingStatus::FocReceived,
        PortingStatus::Completed,
        PortingStatus::Rejected,
        PortingStatus::Failed,
    ];

    public function rules(): array
    {
        return [
            'reference' => ['required', 'string', 'max:64'],
            'status' => ['required', Rule::in(array_map(static fn (PortingStatus $s) => $s->value, self::CARRIER_STATUSES))],
            'foc_at' => ['nullable', 'date', 'required_if:status,FOC_RECEIVED'],
            'reason' => ['nullable', 'string', 'max:500', 'required_if:status,REJECTED,FAILED'],
        ];
    }

    public function status(): PortingStatus
    {
        return PortingStatus::from((string) $this->validated()['status']);
    }

    public function focAt(): ?CarbonImmutable
    {
        $value = $this->validated()['foc_at'] ?? null;

        return $value === null ? null : CarbonImmutable::parse((string) $value)->utc();
    }
}
```

## apps/hosted-services/app/Http/Requests/Porting/PortingDraftRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Porting/PortingDraftRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Porting;

use App\Http\Requests\ApiFormRequest;

/**
 * Body for creating (POST) or editing (PATCH) a draft port-in request.
 * Business-day lead time, duplicate numbers across open requests and LOA
 * presence at submit time are enforced by PortingService / state machine.
 */
final class PortingDraftRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $maxNumbers = (int) config('hosted.porting.max_numbers_per_request', 100);

        $rules = [
            'numbers' => ['required', 'array', 'list', 'min:1', 'max:' . $maxNumbers],
            'numbers.*' => ['required', 'string', 'max:20', 'distinct'],
            'losing_carrier' => ['required', 'string', 'min:2', 'max:80'],
            'carrier_account_number' => ['required', 'string', 'max:40'],
            'carrier_pin' => ['nullable', 'string', 'max:20'],
            'billing_telephone_number' => ['required', 'string', 'max:20'],
            'authorised_name' => ['required', 'string', 'min:2', 'max:120'],
            'service_address' => ['required', 'array:line1,line2,city,region,postal_code,country'],
            'service_address.line1' => ['required', 'string', 'max:120'],
            'service_address.line2' => ['nullable', 'string', 'max:120'],
            'service_address.city' => ['required', 'string', 'max:80'],
            'service_address.region' => ['required', 'string', 'size:2', 'alpha'],
            'service_address.postal_code' => ['required', 'string', 'regex:/^\d{5}(-\d{4})?$/'],
            'service_address.country' => ['required', 'string', 'in:US,CA'],
            'requested_port_date' => ['required', 'date_format:Y-m-d'],
            'loa_document_ref' => ['nullable', 'string', 'max:120'],
        ];

        return $this->isMethod('PATCH') ? self::partial($rules) : $rules;
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/ConfigureVoicemailRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/ConfigureVoicemailRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;
use App\Models\VoicemailBox;
use Illuminate\Validation\Rule;

/**
 * PUT /extensions/{id}/voicemail. The PIN is accepted as a string so that
 * leading zeros survive; strength rules are applied by VoicemailPinPolicy.
 */
final class ConfigureVoicemailRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'pin' => ['sometimes', 'string', 'regex:/^\d+$/', 'max:16'],
            'greeting_type' => ['sometimes', Rule::in(VoicemailBox::GREETING_TYPES)],
            'notification_email' => ['sometimes', 'nullable', 'string', 'email:rfc', 'max:254'],
            'attach_audio' => ['sometimes', 'boolean'],
            'delete_after_email' => ['sometimes', 'boolean'],
            'transcription_enabled' => ['sometimes', 'boolean'],
            'max_message_seconds' => ['sometimes', 'integer'],
        ];
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/ExtensionRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/ExtensionRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /extensions creates; PATCH /extensions/{id} reuses the same rules as
 * optional fields. The short-dial number is fixed once provisioned because
 * desk phones and hunt groups reference it.
 */
final class ExtensionRequest extends ApiFormRequest
{
    public function rules(): array
    {
        $rules = [
            'number' => ['nullable', 'string', 'regex:/^\d{3,6}$/'],
            'display_name' => ['required', 'string', 'min:1', 'max:80'],
            'email' => ['nullable', 'string', 'email:rfc', 'max:254'],
            'caller_id_number_id' => ['nullable', 'uuid'],
            'do_not_disturb' => ['boolean'],
        ];

        if ($this->isMethod('PATCH')) {
            return self::partial($rules, immutable: ['number']);
        }

        unset($rules['do_not_disturb']);

        return $rules;
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/HuntGroupRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/HuntGroupRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\HuntGroupStrategy;
use App\Http\Requests\ApiFormRequest;
use App\Models\HuntGroup;
use Illuminate\Validation\Rule;

/**
 * Hunt groups are written as a whole (POST and PUT) because member order,
 * strategy and ring times are only meaningful together.
 */
final class HuntGroupRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:1', 'max:60'],
            'pilot_extension' => ['required', 'string', 'regex:/^\d{3,6}$/'],
            'pilot_number_id' => ['nullable', 'uuid'],
            'strategy' => ['required', Rule::enum(HuntGroupStrategy::class)],
            'ring_seconds' => ['required', 'integer'],
            'members' => ['required', 'array', 'list', 'min:1'],
            'members.*' => ['array:extension_id,ring_seconds'],
            'members.*.extension_id' => ['required', 'uuid'],
            'members.*.ring_seconds' => ['nullable', 'integer'],
            'no_answer_type' => ['required', Rule::in(HuntGroup::NO_ANSWER_TYPES)],
            'no_answer_destination' => [
                'nullable',
                'string',
                'max:32',
                Rule::requiredIf(fn () => in_array($this->input('no_answer_type'), ['EXTENSION', 'EXTERNAL'], true)),
            ],
        ];
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/OrderNumbersRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/OrderNumbersRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * POST /numbers/orders: activate numbers previously reserved by a search.
 */
final class OrderNumbersRequest extends ApiFormRequest
{
    public const MAX_PER_ORDER = 20;

    public function rules(): array
    {
        return [
            'numbers' => ['required', 'array', 'list', 'min:1', 'max:' . self::MAX_PER_ORDER],
            'numbers.*' => ['required', 'string', 'max:20', 'distinct'],
        ];
    }

    /**
     * @return list<string>
     */
    public function numbers(): array
    {
        return array_values($this->validated()['numbers']);
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/ReplaceForwardingRulesRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/ReplaceForwardingRulesRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\ForwardingCondition;
use App\Http\Requests\ApiFormRequest;
use App\Models\CallForwardingRule;
use Illuminate\Validation\Rule;

/**
 * PUT replaces the whole rule set. Shape checks only; per-condition rules,
 * loop detection and number policy live in ForwardingRuleValidator.
 */
final class ReplaceForwardingRulesRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'rules' => ['present', 'array', 'list', 'max:' . count(ForwardingCondition::cases())],
            'rules.*' => ['array:condition,destination_type,destination,ring_seconds,enabled'],
            'rules.*.condition' => ['required', Rule::enum(ForwardingCondition::class)],
            'rules.*.destination_type' => ['required', Rule::in(CallForwardingRule::DESTINATION_TYPES)],
            'rules.*.destination' => ['nullable', 'string', 'max:32'],
            'rules.*.ring_seconds' => ['nullable', 'integer'],
            'rules.*.enabled' => ['boolean'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function forwardingRules(): array
    {
        return array_values($this->validated()['rules']);
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/SearchNumbersRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/SearchNumbersRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Http\Requests\ApiFormRequest;

/**
 * GET /numbers/available?npa=415&quantity=5
 */
final class SearchNumbersRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'npa' => ['required', 'string', 'regex:/^[2-9]\d{2}$/'],
            'quantity' => ['sometimes', 'integer', 'min:1', 'max:' . OrderNumbersRequest::MAX_PER_ORDER],
        ];
    }

    public function npa(): string
    {
        return (string) $this->validated()['npa'];
    }

    public function quantity(): int
    {
        return (int) ($this->validated()['quantity'] ?? 5);
    }
}
```

## apps/hosted-services/app/Http/Requests/Voice/UpdateNumberRequest.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Requests/Voice/UpdateNumberRequest.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests\Voice;

use App\Enums\Role;
use App\Exceptions\AccessDeniedException;
use App\Http\Middleware\AuthenticateJwt;
use App\Http\Requests\ApiFormRequest;

/**
 * PATCH /numbers/{id}. Marking the E911 address verified is a regulated
 * attestation performed by Uniti support after checking the dispatchable
 * address, so customers and partners may not set it themselves.
 */
final class UpdateNumberRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'label' => ['sometimes', 'nullable', 'string', 'max:60'],
            'extension_id' => ['sometimes', 'nullable', 'uuid'],
            'emergency_address_verified' => ['sometimes', 'boolean'],
        ];
    }

    protected function passedValidation(): void
    {
        if (!$this->has('emergency_address_verified')) {
            return;
        }

        if (!AuthenticateJwt::principal($this)->hasRole(Role::SupportAgent)) {
            throw new AccessDeniedException('Only Uniti support can change the emergency address verification.');
        }
    }
}
```

## apps/hosted-services/app/Http/Resources/ApiResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/ApiResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\Page;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Base for API representations. Resources decide exactly which attributes
 * leave the service: provisioning references, hashes and carrier secrets
 * are never serialised.
 */
abstract class ApiResource extends JsonResource
{
    /**
     * ISO-8601 UTC with a "Z" designator, as required on the wire.
     */
    protected static function iso(?DateTimeInterface $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return \DateTimeImmutable::createFromInterface($value)
            ->setTimezone(new \DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s\Z');
    }

    /**
     * Render a service-layer page through this resource.
     *
     * @param Page<mixed> $page
     * @return array{items: list<array<string, mixed>>, page: int, pageSize: int, total: int}
     */
    public static function page(Page $page, Request $request): array
    {
        return $page->map(static fn ($model) => (new static($model))->resolve($request))->jsonSerialize();
    }

    /**
     * @param iterable<mixed> $models
     * @return list<array<string, mixed>>
     */
    public static function list(iterable $models, Request $request): array
    {
        $items = [];
        foreach ($models as $model) {
            $items[] = (new static($model))->resolve($request);
        }

        return $items;
    }
}
```

## apps/hosted-services/app/Http/Resources/DnsRecordResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/DnsRecordResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\DnsRecord;
use Illuminate\Http\Request;

/**
 * @property DnsRecord $resource
 */
final class DnsRecordResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $record = $this->resource;

        return [
            'id' => $record->id,
            'name' => $record->name,
            'type' => $record->type->value,
            'value' => $record->value,
            'ttl' => $record->ttl,
            'priority' => $record->priority,
            'weight' => $record->weight,
            'port' => $record->port,
            'systemManaged' => (bool) $record->system_managed,
            'editable' => !$record->system_managed && $record->type->isCustomerManaged(),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/EmailDomainResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/EmailDomainResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\EmailDomain;
use App\Services\Mail\QuotaSummary;
use Illuminate\Http\Request;

/**
 * Wraps an email domain together with its pooled storage summary, which is
 * always computed by the caller (EmailDomainService::quotaFor) so the
 * resource performs no I/O of its own.
 */
final class EmailDomainResource extends ApiResource
{
    public function __construct(EmailDomain $domain, private readonly QuotaSummary $quota)
    {
        parent::__construct($domain);
    }

    public function toArray(Request $request): array
    {
        /** @var EmailDomain $domain */
        $domain = $this->resource;

        return [
            'id' => $domain->id,
            'domain' => $domain->domain,
            'planCode' => $domain->plan_code,
            'addonBlocks' => $domain->addon_blocks,
            'mxVerified' => (bool) $domain->mx_verified,
            'status' => $domain->status->value,
            'quota' => $this->quota->jsonSerialize(),
            'createdAt' => self::iso($domain->created_at),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/ExtensionResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/ExtensionResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Extension;
use Illuminate\Http\Request;

/**
 * @property Extension $resource
 */
final class ExtensionResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $extension = $this->resource;

        return [
            'id' => $extension->id,
            'accountId' => $extension->account_id,
            'number' => $extension->number,
            'displayName' => $extension->display_name,
            'email' => $extension->email,
            'callerIdNumberId' => $extension->caller_id_number_id,
            'doNotDisturb' => (bool) $extension->do_not_disturb,
            'status' => $extension->status->value,
            'createdAt' => self::iso($extension->created_at),
            'updatedAt' => self::iso($extension->updated_at),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/ForwardingRuleResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/ForwardingRuleResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\CallForwardingRule;
use Illuminate\Http\Request;

/**
 * @property CallForwardingRule $resource
 */
final class ForwardingRuleResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $rule = $this->resource;

        return [
            'id' => $rule->id,
            'condition' => $rule->condition->value,
            'precedence' => $rule->condition->precedence(),
            'destinationType' => $rule->destination_type,
            'destination' => $rule->destination,
            'ringSeconds' => $rule->ring_seconds,
            'enabled' => (bool) $rule->enabled,
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/HostedDomainResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/HostedDomainResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HostedDomain;
use Illuminate\Http\Request;

/**
 * @property HostedDomain $resource
 */
final class HostedDomainResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $domain = $this->resource;

        return [
            'id' => $domain->id,
            'name' => $domain->name,
            'hostingPlan' => $domain->hosting_plan,
            'delegationVerified' => (bool) $domain->delegation_verified,
            'zoneSerial' => $domain->zone_serial,
            'status' => $domain->status->value,
            'createdAt' => self::iso($domain->created_at),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/HostedNumberResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/HostedNumberResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HostedNumber;
use App\Support\PhoneNumber;
use Illuminate\Http\Request;

/**
 * @property HostedNumber $resource
 */
final class HostedNumberResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $number = $this->resource;

        return [
            'id' => $number->id,
            'e164' => $number->e164,
            'areaCode' => PhoneNumber::tryParse($number->e164)?->npa(),
            'label' => $number->label,
            'status' => $number->status->value,
            'extensionId' => $number->extension_id,
            'portingRequestId' => $number->porting_request_id,
            'emergencyAddressVerified' => (bool) $number->emergency_address_verified,
            'usableAsCallerId' => $number->canBeOutboundCallerId(),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/HuntGroupResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/HuntGroupResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\HuntGroup;
use App\Models\HuntGroupMember;
use App\Services\Voice\HuntGroupService;
use Illuminate\Http\Request;

/**
 * Includes the worst-case caller wait so the portal can warn before a
 * customer saves a configuration that leaves callers ringing for minutes.
 *
 * @property HuntGroup $resource
 */
final class HuntGroupResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $group = $this->resource;
        $members = $group->members->sortBy('position')->values();

        return [
            'id' => $group->id,
            'name' => $group->name,
            'pilotExtension' => $group->pilot_extension,
            'pilotNumberId' => $group->pilot_number_id,
            'strategy' => $group->strategy->value,
            'ordered' => $group->strategy->isOrdered(),
            'ringSeconds' => $group->ring_seconds,
            'members' => $members->map(static fn (HuntGroupMember $m) => [
                'extensionId' => $m->extension_id,
                'position' => $m->position,
                'ringSeconds' => $m->ring_seconds,
            ])->all(),
            'maxWaitSeconds' => HuntGroupService::maxWaitSeconds(
                $group->strategy,
                $group->ring_seconds,
                $members->map(static fn (HuntGroupMember $m) => $m->ring_seconds ?? $group->ring_seconds)->all(),
            ),
            'noAnswer' => [
                'type' => $group->no_answer_type,
                'destination' => $group->no_answer_destination,
            ],
            'status' => $group->status->value,
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/MailAliasResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/MailAliasResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\MailAlias;
use Illuminate\Http\Request;

/**
 * @property MailAlias $resource
 */
final class MailAliasResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $alias = $this->resource;

        return [
            'id' => $alias->id,
            'emailDomainId' => $alias->email_domain_id,
            'localPart' => $alias->local_part,
            'destinations' => array_values($alias->destinations),
            'description' => $alias->description,
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/MailboxResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/MailboxResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Mailbox;
use App\Services\Mail\QuotaCalculator;
use Illuminate\Http\Request;

/**
 * @property Mailbox $resource
 */
final class MailboxResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $mailbox = $this->resource;
        $usage = app(QuotaCalculator::class)->mailboxUsage((int) $mailbox->used_mb, (int) $mailbox->quota_mb);

        return [
            'id' => $mailbox->id,
            'emailDomainId' => $mailbox->email_domain_id,
            'address' => $mailbox->address(),
            'displayName' => $mailbox->display_name,
            'quotaMb' => $usage['quotaMb'],
            'usedMb' => $usage['usedMb'],
            'usagePercent' => $usage['percent'],
            'usageLevel' => $usage['level'],
            'usageSyncedAt' => self::iso($mailbox->usage_synced_at),
            'forwarding' => [
                'enabled' => (bool) $mailbox->forwarding_enabled,
                'address' => $mailbox->forwarding_address,
                'keepCopy' => (bool) $mailbox->keep_forwarded_copy,
            ],
            'status' => $mailbox->status->value,
            'createdAt' => self::iso($mailbox->created_at),
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/PortingRequestResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/PortingRequestResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\PortingEvent;
use App\Models\PortingRequest;
use App\Services\Porting\PortingService;
use Illuminate\Http\Request;

/**
 * The carrier PIN is write-only. The account number is masked to its last
 * four characters so the portal can confirm which account was used.
 *
 * @property PortingRequest $resource
 */
final class PortingRequestResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $port = $this->resource;

        return [
            'id' => $port->id,
            'status' => $port->status->value,
            'numbers' => array_values($port->numbers),
            'losingCarrier' => $port->losing_carrier,
            'carrierAccountNumber' => self::mask($port->carrier_account_number),
            'carrierPinProvided' => $port->carrier_pin !== null && $port->carrier_pin !== '',
            'billingTelephoneNumber' => $port->billing_telephone_number,
            'authorisedName' => $port->authorised_name,
            'serviceAddress' => $port->service_address,
            'requestedPortDate' => $port->requested_port_date?->toDateString(),
            'focAt' => self::iso($port->foc_at),
            'carrierReference' => $port->carrier_reference,
            'rejectionReason' => $port->rejection_reason,
            'resubmissionCount' => $port->resubmission_count,
            'loaProvided' => $port->loa_document_ref !== null,
            'timeline' => app(PortingService::class)->timeline($port),
            'events' => $this->whenLoaded('events', fn () => $port->events->map(static fn (PortingEvent $e) => [
                'from' => $e->from_status?->value,
                'to' => $e->to_status->value,
                'actor' => $e->actor,
                'note' => $e->note,
                'occurredAt' => self::iso($e->occurred_at),
            ])->all()),
            'createdAt' => self::iso($port->created_at),
            'updatedAt' => self::iso($port->updated_at),
        ];
    }

    private static function mask(string $value): string
    {
        $visible = 4;
        $length = strlen($value);

        return $length <= $visible ? str_repeat('*', $length) : str_repeat('*', $length - $visible) . substr($value, -$visible);
    }
}
```

## apps/hosted-services/app/Http/Resources/SslCertificateResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/SslCertificateResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\SslCertificate;
use App\Services\Hosting\SslCertificateService;
use Illuminate\Http\Request;

/**
 * While validation is pending the DNS-01 challenge records are exposed so
 * customers whose zone is not hosted with Uniti can publish them manually.
 *
 * @property SslCertificate $resource
 */
final class SslCertificateResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $certificate = $this->resource;
        $pending = !$certificate->status->isActive() && $certificate->validation_expires_at !== null;

        return [
            'id' => $certificate->id,
            'commonName' => $certificate->common_name,
            'subjectAltNames' => array_values($certificate->subject_alt_names),
            'status' => $certificate->status->value,
            'health' => app(SslCertificateService::class)->health($certificate),
            'autoRenew' => (bool) $certificate->auto_renew,
            'issuer' => $certificate->issuer,
            'serialNumber' => $certificate->serial_number,
            'notBefore' => self::iso($certificate->not_before),
            'notAfter' => self::iso($certificate->not_after),
            'validation' => $pending ? [
                'expiresAt' => self::iso($certificate->validation_expires_at),
                'challenges' => array_map(
                    static fn (string $fqdn, string $token) => ['name' => $fqdn, 'type' => 'TXT', 'value' => $token],
                    array_keys($certificate->challenges ?? []),
                    array_values($certificate->challenges ?? []),
                ),
            ] : null,
            'failureReason' => $certificate->failure_reason,
            'renewedFromId' => $certificate->renewed_from_id,
        ];
    }
}
```

## apps/hosted-services/app/Http/Resources/VoicemailBoxResource.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Http/Resources/VoicemailBoxResource.php`.

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\VoicemailBox;
use Illuminate\Http\Request;

/**
 * The PIN hash is never returned; "pinSet" lets the portal show whether a
 * PIN exists without exposing anything derived from it.
 *
 * @property VoicemailBox $resource
 */
final class VoicemailBoxResource extends ApiResource
{
    public function toArray(Request $request): array
    {
        $box = $this->resource;

        return [
            'extensionId' => $box->extension_id,
            'enabled' => $box->exists,
            'pinSet' => $box->pin_hash !== null && $box->pin_hash !== '',
            'greetingType' => $box->greeting_type,
            'notificationEmail' => $box->notification_email,
            'attachAudio' => (bool) $box->attach_audio,
            'deleteAfterEmail' => (bool) $box->delete_after_email,
            'transcriptionEnabled' => (bool) $box->transcription_enabled,
            'maxMessageSeconds' => (int) $box->max_message_seconds,
            'unreadCount' => (int) $box->unread_count,
        ];
    }
}
```

## apps/hosted-services/app/Models/BaseModel.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/BaseModel.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Common settings for every hosted-services table: UUID primary keys,
 * UTC timestamps, and mass assignment governed by $fillable on subclasses.
 */
abstract class BaseModel extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $dateFormat = 'Y-m-d H:i:sP';

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];
}
```

## apps/hosted-services/app/Models/CallForwardingRule.php

Application: Hosted Services (hosted voice, email, web hosting). Stack: PHP 8 (Laravel-style). Language: php. Path: `apps/hosted-services/app/Models/CallForwardingRule.php`.

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ForwardingCondition;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string              $id
 * @property string              $extension_id
 * @property ForwardingCondition $condition
 * @property string              $destination_type  EXTENSION | EXTERNAL | VOICEMAIL
 * @property string|null         $destination       Extension number or E.164.
 * @property int|null            $ring_seconds      Only for NO_ANSWER.
 * @property bool                $enabled
 */
class CallForwardingRule extends BaseModel
{
    public const DEST_EXTENSION = 'EXTENSION';
    public const DEST_EXTERNAL = 'EXTERNAL';
    public const DEST_VOICEMAIL = 'VOICEMAIL';

    public const DESTINATION_TYPES = [self::DEST_EXTENSION, self::DEST_EXTERNAL, self::DEST_VOICEMAIL];

    protected $table = 'call_forwarding_rules';

    protected $fillable = [
        'extension_id',
        'condition',
        'destination_type',
        'destination',
        'ring_seconds',
        'enabled',
    ];

    protected $casts = [
        'condition' => ForwardingCondition::class,
        'ring_seconds' => 'integer',
        'enabled' => 'boolean',
        'created_at' => 'immutable_datetime',
        'updated_at' => 'immutable_datetime',
    ];

    public function extension(): BelongsTo
    {
        return $this->belongsTo(Extension::class);
    }
}
```

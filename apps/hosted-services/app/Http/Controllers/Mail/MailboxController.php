<?php

declare(strict_types=1);

namespace App\Http\Controllers\Mail;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mail\MailboxRequest;
use App\Http\Resources\MailboxResource;
use App\Services\Mail\MailboxService;
use App\Support\Page;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Temporary passwords are shown exactly once, in the create and
 * reset-password responses, which are marked non-cacheable.
 */
final class MailboxController extends Controller
{
    public function __construct(private readonly MailboxService $mailboxes)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        [$page, $pageSize] = Page::paramsFrom($request);
        $result = $this->mailboxes->list($accountId, $domainId, $page, $pageSize, $this->stringQuery($request, 'q'));

        return $this->ok(MailboxResource::page($result, $request));
    }

    public function show(Request $request, string $accountId, string $mailboxId): JsonResponse
    {
        return $this->ok((new MailboxResource($this->mailboxes->get($accountId, $mailboxId)))->resolve($request));
    }

    public function store(MailboxRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $result = $this->mailboxes->create($accountId, $domainId, $request->validated(), $this->principal($request));
        $mailbox = $result['mailbox'];

        $response = $this->created(
            (new MailboxResource($mailbox))->resolve($request) + ['temporaryPassword' => $result['temporaryPassword']],
            sprintf('/api/v1/accounts/%s/mailboxes/%s', $accountId, $mailbox->id),
        );

        return $this->withoutCaching($response);
    }

    public function update(MailboxRequest $request, string $accountId, string $mailboxId): JsonResponse
    {
        $mailbox = $this->mailboxes->update($accountId, $mailboxId, $request->payload());

        return $this->ok((new MailboxResource($mailbox))->resolve($request));
    }

    public function resetPassword(Request $request, string $accountId, string $mailboxId): JsonResponse
    {
        $password = $this->mailboxes->resetPassword($accountId, $mailboxId, $this->principal($request));

        return $this->withoutCaching($this->ok(['temporaryPassword' => $password]));
    }

    public function destroy(Request $request, string $accountId, string $mailboxId): Response
    {
        $this->mailboxes->delete($accountId, $mailboxId, $this->principal($request));

        return $this->noContent();
    }

    private function withoutCaching(JsonResponse $response): JsonResponse
    {
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('Pragma', 'no-cache');

        return $response;
    }
}

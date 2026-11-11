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

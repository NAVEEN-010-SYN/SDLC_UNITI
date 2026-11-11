<?php

declare(strict_types=1);

namespace App\Http\Controllers\Hosting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Hosting\CertificateChangeRequest;
use App\Http\Requests\Hosting\CertificateRequest;
use App\Http\Resources\SslCertificateResource;
use App\Services\Hosting\SslCertificateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CertificateController extends Controller
{
    public function __construct(private readonly SslCertificateService $certificates)
    {
    }

    public function index(Request $request, string $accountId, string $domainId): JsonResponse
    {
        $items = SslCertificateResource::list($this->certificates->list($accountId, $domainId), $request);

        return $this->ok(['items' => $items, 'page' => 1, 'pageSize' => count($items), 'total' => count($items)]);
    }

    /**
     * Issuance is asynchronous (DNS-01 validation), hence 202 Accepted.
     */
    public function store(CertificateRequest $request, string $accountId, string $domainId): JsonResponse
    {
        $certificate = $this->certificates->request(
            $accountId,
            $domainId,
            (string) $request->validated()['common_name'],
            $request->subjectAltNames(),
            $request->autoRenew(),
            $this->principal($request),
        );

        return $this->accepted(
            (new SslCertificateResource($certificate))->resolve($request),
            sprintf('/api/v1/accounts/%s/domains/%s/certificates/%s', $accountId, $domainId, $certificate->id),
        );
    }

    public function update(CertificateChangeRequest $request, string $accountId, string $domainId, string $certificateId): JsonResponse
    {
        $certificate = $this->certificates->setAutoRenew($accountId, $domainId, $certificateId, $request->autoRenew());

        return $this->ok((new SslCertificateResource($certificate))->resolve($request));
    }

    public function revoke(CertificateChangeRequest $request, string $accountId, string $domainId, string $certificateId): JsonResponse
    {
        $certificate = $this->certificates->revoke(
            $accountId,
            $domainId,
            $certificateId,
            $request->rfc5280Reason(),
            $this->principal($request),
        );

        return $this->ok((new SslCertificateResource($certificate))->resolve($request));
    }
}

<?php

declare(strict_types=1);

namespace App\Clients;

use Carbon\CarbonImmutable;

/**
 * Internal ACME proxy. Orders DV certificates using DNS-01 challenges,
 * which we can satisfy ourselves because Uniti serves the customer's zone.
 */
class CertificateAuthorityClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    /**
     * @param list<string> $names
     * @return array{orderRef: string, challenges: array<string, string>, expiresAt: CarbonImmutable}
     *         challenges maps the TXT record FQDN to the token value.
     */
    public function createOrder(array $names, string $idempotencyKey): array
    {
        $result = $this->http->post('/orders', [
            'identifiers' => $names,
            'challengeType' => 'dns-01',
        ], $idempotencyKey);

        $challenges = [];
        foreach ($result['challenges'] ?? [] as $challenge) {
            $challenges[(string) $challenge['recordName']] = (string) $challenge['recordValue'];
        }

        return [
            'orderRef' => (string) $result['orderId'],
            'challenges' => $challenges,
            'expiresAt' => CarbonImmutable::parse((string) $result['expiresAt']),
        ];
    }

    /**
     * Ask the CA to validate challenges and finalise the order.
     *
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    public function finalise(string $orderRef): array
    {
        $result = $this->http->post('/orders/' . rawurlencode($orderRef) . '/finalize', [], 'finalize-' . $orderRef);

        return $this->mapOrder($result);
    }

    /**
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    public function getOrder(string $orderRef): array
    {
        return $this->mapOrder($this->http->get('/orders/' . rawurlencode($orderRef)));
    }

    public function revoke(string $orderRef, string $reason): void
    {
        $this->http->post('/orders/' . rawurlencode($orderRef) . '/revoke', ['reason' => $reason]);
    }

    /**
     * @param array<string, mixed> $order
     * @return array{status: string, serialNumber: ?string, issuer: ?string, notBefore: ?CarbonImmutable, notAfter: ?CarbonImmutable, error: ?string}
     */
    private function mapOrder(array $order): array
    {
        $date = static fn (mixed $v) => is_string($v) && $v !== '' ? CarbonImmutable::parse($v) : null;

        return [
            'status' => strtolower((string) ($order['status'] ?? 'pending')),
            'serialNumber' => isset($order['serialNumber']) ? (string) $order['serialNumber'] : null,
            'issuer' => isset($order['issuer']) ? (string) $order['issuer'] : null,
            'notBefore' => $date($order['notBefore'] ?? null),
            'notAfter' => $date($order['notAfter'] ?? null),
            'error' => isset($order['error']) ? (string) $order['error'] : null,
        ];
    }
}

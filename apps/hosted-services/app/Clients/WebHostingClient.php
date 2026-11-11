<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\HostedDomain;

/**
 * Web hosting and authoritative DNS platform API.
 */
class WebHostingClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    public function createSite(HostedDomain $domain): string
    {
        $result = $this->http->post('/sites', [
            'accountId' => $domain->account_id,
            'domain' => $domain->name,
            'plan' => $domain->hosting_plan,
        ], 'site-' . $domain->id);

        return (string) $result['id'];
    }

    public function deleteSite(string $siteRef): void
    {
        $this->http->delete('/sites/' . rawurlencode($siteRef));
    }

    /**
     * Nameservers customers must configure at their registrar.
     *
     * @return list<string>
     */
    public function nameservers(): array
    {
        $result = $this->http->get('/dns/nameservers');

        return array_values(array_map('strval', $result['nameservers'] ?? []));
    }

    /**
     * Does the public DNS delegation already point at Uniti?
     */
    public function checkDelegation(string $zone): bool
    {
        $result = $this->http->get('/dns/delegation', ['zone' => $zone]);

        return (bool) ($result['delegated'] ?? false);
    }

    /**
     * Push the complete zone. The platform swaps it atomically and returns
     * once all anycast nodes have acknowledged the new serial.
     */
    public function publishZone(string $zone, int $serial, string $zoneFile): void
    {
        $this->http->put('/dns/zones/' . rawurlencode($zone), [
            'serial' => $serial,
            'format' => 'rfc1035',
            'zone' => $zoneFile,
        ]);
    }

    public function deleteZone(string $zone): void
    {
        $this->http->delete('/dns/zones/' . rawurlencode($zone));
    }

    /**
     * Install an issued certificate on the site's TLS terminators.
     */
    public function installCertificate(string $siteRef, string $certificateOrderRef): void
    {
        $this->http->put('/sites/' . rawurlencode($siteRef) . '/certificate', [
            'certificateOrderRef' => $certificateOrderRef,
        ]);
    }
}

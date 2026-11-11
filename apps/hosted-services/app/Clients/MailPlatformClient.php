<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Models\Mailbox;

/**
 * Hosted email platform provisioning API.
 */
class MailPlatformClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    public function createDomain(EmailDomain $domain): string
    {
        $result = $this->http->post('/domains', [
            'accountId' => $domain->account_id,
            'domain' => $domain->domain,
            'plan' => $domain->plan_code,
        ], 'maildomain-' . $domain->id);

        return (string) $result['id'];
    }

    /**
     * @return array{verified: bool, observedMx: list<string>}
     */
    public function verifyMx(string $domainRef): array
    {
        $result = $this->http->get('/domains/' . rawurlencode($domainRef) . '/mx-check');

        return [
            'verified' => (bool) ($result['verified'] ?? false),
            'observedMx' => array_values(array_map('strval', $result['observedMx'] ?? [])),
        ];
    }

    public function setDomainStorage(string $domainRef, int $capacityMb): void
    {
        $this->http->put('/domains/' . rawurlencode($domainRef) . '/storage', ['capacityMb' => $capacityMb]);
    }

    public function createMailbox(Mailbox $mailbox, string $address, string $initialPassword): string
    {
        $result = $this->http->post('/mailboxes', [
            'domainId' => $mailbox->emailDomain->external_ref,
            'address' => $address,
            'displayName' => $mailbox->display_name,
            'quotaMb' => $mailbox->quota_mb,
            'password' => $initialPassword,
            'forcePasswordChange' => true,
        ], 'mailbox-' . $mailbox->id);

        return (string) $result['id'];
    }

    public function updateMailbox(Mailbox $mailbox): void
    {
        $this->http->put('/mailboxes/' . rawurlencode((string) $mailbox->external_ref), [
            'displayName' => $mailbox->display_name,
            'quotaMb' => $mailbox->quota_mb,
            'forwarding' => $mailbox->forwarding_enabled
                ? ['address' => $mailbox->forwarding_address, 'keepCopy' => $mailbox->keep_forwarded_copy]
                : null,
            'suspended' => $mailbox->status->value === 'SUSPENDED',
        ]);
    }

    public function resetPassword(string $mailboxRef, string $temporaryPassword): void
    {
        $this->http->post('/mailboxes/' . rawurlencode($mailboxRef) . '/password', [
            'password' => $temporaryPassword,
            'forcePasswordChange' => true,
        ]);
    }

    public function deleteMailbox(string $mailboxRef): void
    {
        $this->http->delete('/mailboxes/' . rawurlencode($mailboxRef));
    }

    /**
     * Current storage usage for every mailbox on a domain.
     *
     * @return array<string, int> Mailbox platform ref => used MB.
     */
    public function fetchUsage(string $domainRef): array
    {
        $result = $this->http->get('/domains/' . rawurlencode($domainRef) . '/usage');

        $usage = [];
        foreach ($result['mailboxes'] ?? [] as $row) {
            $usage[(string) $row['id']] = (int) ceil(((int) $row['usedBytes']) / 1_048_576);
        }

        return $usage;
    }

    public function upsertAlias(MailAlias $alias, string $address): void
    {
        $this->http->put('/aliases/' . rawurlencode($address), [
            'domainId' => $alias->emailDomain->external_ref,
            'destinations' => $alias->destinations,
        ]);
    }

    public function deleteAlias(string $address): void
    {
        $this->http->delete('/aliases/' . rawurlencode($address));
    }
}

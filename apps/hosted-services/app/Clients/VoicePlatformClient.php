<?php

declare(strict_types=1);

namespace App\Clients;

use App\Models\CallForwardingRule;
use App\Models\Extension;
use App\Models\HuntGroup;
use App\Models\PortingRequest;

/**
 * Hosted PBX / softswitch provisioning API.
 */
class VoicePlatformClient
{
    public function __construct(private readonly ProvisioningHttpClient $http)
    {
    }

    /**
     * Reserve available DIDs in a rate centre (NPA) for the account.
     *
     * @return list<string> E.164 numbers reserved for 15 minutes.
     */
    public function searchAvailableNumbers(string $accountId, string $npa, int $quantity): array
    {
        $result = $this->http->get('/inventory/numbers', [
            'accountId' => $accountId,
            'npa' => $npa,
            'quantity' => $quantity,
        ]);

        return array_values(array_map('strval', $result['numbers'] ?? []));
    }

    /**
     * @return string Platform reference for the activated number.
     */
    public function activateNumber(string $accountId, string $e164): string
    {
        $result = $this->http->post('/numbers', ['accountId' => $accountId, 'number' => $e164], 'activate-' . $e164);

        return (string) $result['id'];
    }

    public function releaseNumber(string $externalRef): void
    {
        $this->http->delete('/numbers/' . rawurlencode($externalRef));
    }

    public function routeNumber(string $externalRef, ?string $extensionRef): void
    {
        $this->http->put('/numbers/' . rawurlencode($externalRef) . '/routing', ['extensionId' => $extensionRef]);
    }

    public function createExtension(Extension $extension): string
    {
        $result = $this->http->post('/extensions', [
            'accountId' => $extension->account_id,
            'number' => $extension->number,
            'displayName' => $extension->display_name,
            'email' => $extension->email,
        ], 'ext-' . $extension->id);

        return (string) $result['id'];
    }

    public function updateExtension(Extension $extension, ?string $callerIdE164): void
    {
        $this->http->put('/extensions/' . rawurlencode((string) $extension->external_ref), [
            'displayName' => $extension->display_name,
            'email' => $extension->email,
            'doNotDisturb' => $extension->do_not_disturb,
            'callerId' => $callerIdE164,
        ]);
    }

    public function deleteExtension(string $externalRef): void
    {
        $this->http->delete('/extensions/' . rawurlencode($externalRef));
    }

    /**
     * Replace the full forwarding rule set for an extension atomically.
     *
     * @param iterable<CallForwardingRule> $rules
     */
    public function replaceForwardingRules(string $extensionRef, iterable $rules): void
    {
        $payload = [];
        foreach ($rules as $rule) {
            if (!$rule->enabled) {
                continue;
            }
            $payload[] = [
                'condition' => $rule->condition->value,
                'destinationType' => $rule->destination_type,
                'destination' => $rule->destination,
                'ringSeconds' => $rule->ring_seconds,
            ];
        }

        $this->http->put('/extensions/' . rawurlencode($extensionRef) . '/forwarding', ['rules' => $payload]);
    }

    /**
     * @param array<string, mixed> $settings
     */
    public function configureVoicemail(string $extensionRef, array $settings): void
    {
        $this->http->put('/extensions/' . rawurlencode($extensionRef) . '/voicemail', $settings);
    }

    /**
     * @param list<array{extensionRef: string, ringSeconds: int}> $members
     */
    public function upsertHuntGroup(HuntGroup $group, array $members, ?string $pilotNumberRef): void
    {
        $this->http->put('/hunt-groups/' . rawurlencode($group->id), [
            'accountId' => $group->account_id,
            'name' => $group->name,
            'pilotExtension' => $group->pilot_extension,
            'pilotNumberId' => $pilotNumberRef,
            'strategy' => $group->strategy->value,
            'noAnswer' => ['type' => $group->no_answer_type, 'destination' => $group->no_answer_destination],
            'members' => $members,
        ]);
    }

    public function deleteHuntGroup(string $huntGroupId): void
    {
        $this->http->delete('/hunt-groups/' . rawurlencode($huntGroupId));
    }

    /**
     * Submit a port-in order to the number portability gateway.
     *
     * @return string Gateway reference (PON).
     */
    public function submitPortOrder(PortingRequest $request): string
    {
        $result = $this->http->post('/porting/orders', [
            'accountId' => $request->account_id,
            'numbers' => $request->numbers,
            'losingCarrier' => $request->losing_carrier,
            'carrierAccountNumber' => $request->carrier_account_number,
            'carrierPin' => $request->carrier_pin,
            'billingTelephoneNumber' => $request->billing_telephone_number,
            'authorizedName' => $request->authorised_name,
            'serviceAddress' => $request->service_address,
            'requestedPortDate' => $request->requested_port_date->toDateString(),
            'loaDocumentRef' => $request->loa_document_ref,
        ], 'port-' . $request->id . '-' . $request->resubmission_count);

        return (string) $result['orderReference'];
    }

    public function cancelPortOrder(string $carrierReference): void
    {
        $this->http->delete('/porting/orders/' . rawurlencode($carrierReference));
    }
}

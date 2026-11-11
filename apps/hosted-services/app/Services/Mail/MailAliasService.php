<?php

declare(strict_types=1);

namespace App\Services\Mail;

use App\Clients\MailPlatformClient;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ConflictException;
use App\Exceptions\ResourceNotFoundException;
use App\Exceptions\ValidationFailedException;
use App\Models\EmailDomain;
use App\Models\MailAlias;
use App\Repositories\EmailDomainRepository;
use App\Support\Page;

/**
 * Aliases and distribution lists on a hosted email domain.
 */
final class MailAliasService
{
    public function __construct(
        private readonly EmailDomainRepository $domains,
        private readonly LocalPartPolicy $localParts,
        private readonly MailPlatformClient $mail,
        private readonly int $maxDestinations = 50,
        private readonly bool $allowExternalForwarding = true,
    ) {
    }

    /**
     * @return Page<MailAlias>
     */
    public function list(string $accountId, string $domainId, int $page, int $pageSize): Page
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);

        return $this->domains->aliases($domain->id, $page, $pageSize);
    }

    /**
     * @param array{local_part: string, destinations: list<string>, description?: ?string} $data
     */
    public function create(string $accountId, string $domainId, array $data): MailAlias
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $localPart = $this->localParts->normalise($data['local_part']);

        if ($this->domains->isLocalPartTaken($domain->id, $localPart)) {
            throw new ConflictException(sprintf('%s@%s is already in use.', $localPart, $domain->domain));
        }

        $alias = new MailAlias([
            'email_domain_id' => $domain->id,
            'local_part' => $localPart,
            'destinations' => $this->normaliseDestinations($domain, $localPart, $data['destinations']),
            'description' => $data['description'] ?? null,
        ]);
        $alias->setRelation('emailDomain', $domain);

        $this->mail->upsertAlias($alias, $localPart . '@' . $domain->domain);
        $alias->save();

        return $alias;
    }

    /**
     * @param array{destinations?: list<string>, description?: ?string} $changes
     */
    public function update(string $accountId, string $domainId, string $aliasId, array $changes): MailAlias
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $alias = $this->find($domain, $aliasId);

        if (isset($changes['destinations'])) {
            $alias->destinations = $this->normaliseDestinations($domain, $alias->local_part, $changes['destinations']);
        }
        if (array_key_exists('description', $changes)) {
            $alias->description = $changes['description'];
        }

        $alias->setRelation('emailDomain', $domain);
        $this->mail->upsertAlias($alias, $alias->local_part . '@' . $domain->domain);
        $alias->save();

        return $alias;
    }

    public function delete(string $accountId, string $domainId, string $aliasId): void
    {
        $domain = $this->domains->getForAccount($accountId, $domainId);
        $alias = $this->find($domain, $aliasId);

        $this->mail->deleteAlias($alias->local_part . '@' . $domain->domain);
        $alias->delete();
    }

    /**
     * @param list<string> $destinations
     * @return list<string>
     */
    public function normaliseDestinations(EmailDomain $domain, string $localPart, array $destinations): array
    {
        $self = $localPart . '@' . $domain->domain;
        $errors = [];
        $result = [];

        foreach ($destinations as $i => $raw) {
            $address = strtolower(trim((string) $raw));
            if (filter_var($address, FILTER_VALIDATE_EMAIL) === false) {
                $errors["destinations.$i"][] = 'Not a valid email address.';
                continue;
            }
            if ($address === $self) {
                $errors["destinations.$i"][] = 'An alias cannot deliver to itself.';
                continue;
            }
            if (!$this->allowExternalForwarding && !str_ends_with($address, '@' . $domain->domain)) {
                $errors["destinations.$i"][] = 'External destinations are disabled for this domain.';
                continue;
            }
            $result[$address] = true;
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        if ($result === []) {
            throw new BusinessRuleException('An alias needs at least one destination.', 'MAIL_ALIAS_EMPTY');
        }

        if (count($result) > $this->maxDestinations) {
            throw new BusinessRuleException(
                sprintf('An alias may have at most %d destinations.', $this->maxDestinations),
                'MAIL_ALIAS_TOO_MANY_DESTINATIONS',
            );
        }

        return array_keys($result);
    }

    private function find(EmailDomain $domain, string $aliasId): MailAlias
    {
        return $this->domains->findAlias($domain->id, $aliasId) ?? throw ResourceNotFoundException::of('Alias', $aliasId);
    }
}

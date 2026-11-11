<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * Input passed syntactic validation but violates a business rule
 * (quota exceeded, CNAME conflict, reserved extension...). The stable
 * "rule" code lets the portals show a localised message.
 */
final class BusinessRuleException extends ApiException
{
    /**
     * @param array<string, mixed> $extensions
     */
    public function __construct(string $detail, private readonly string $rule, array $extensions = [])
    {
        parent::__construct($detail, ['rule' => $rule] + $extensions);
    }

    public function rule(): string
    {
        return $this->rule;
    }

    public function status(): int
    {
        return 422;
    }

    public function problemType(): string
    {
        return 'business-rule-violation';
    }

    public function title(): string
    {
        return 'Business rule violation';
    }
}

<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use PHPUnit\Framework\Assert;

/**
 * Assertions on the stable machine-readable parts of API exceptions (rule
 * code, offending field) rather than on human-readable messages.
 */
trait AssertsApiExceptions
{
    /**
     * @return array<string, mixed> The exception's problem extensions.
     */
    protected function assertBusinessRule(string $expectedRule, callable $action): array
    {
        try {
            $action();
        } catch (BusinessRuleException $e) {
            Assert::assertSame($expectedRule, $e->rule());

            return $e->extensions();
        }

        Assert::fail(sprintf('Expected business rule %s to be violated.', $expectedRule));
    }

    /**
     * @return list<string> Messages reported for the field.
     */
    protected function assertFieldError(string $expectedField, callable $action): array
    {
        try {
            $action();
        } catch (ValidationFailedException $e) {
            $errors = $e->extensions()['errors'];
            Assert::assertArrayHasKey($expectedField, $errors, 'Fields with errors: ' . implode(', ', array_keys($errors)));

            return $errors[$expectedField];
        }

        Assert::fail(sprintf('Expected a validation error on %s.', $expectedField));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Unit\Mail;

use App\Services\Mail\LocalPartPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class LocalPartPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private LocalPartPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new LocalPartPolicy(['postmaster', 'abuse']);
    }

    public function testNormalisesCaseAndWhitespace(): void
    {
        self::assertSame('jane.doe', $this->policy->normalise('  Jane.Doe '));
        self::assertSame('sales_team-2', $this->policy->normalise('Sales_Team-2'));
    }

    #[DataProvider('invalidLocalParts')]
    public function testInvalidLocalPartsAreFieldErrors(string $input): void
    {
        $this->assertFieldError('destinations.0', fn () => $this->policy->normalise($input, 'destinations.0'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function invalidLocalParts(): iterable
    {
        yield 'empty' => ['   '];
        yield 'too long' => [str_repeat('a', 65)];
        yield 'plus addressing' => ['jane+news'];
        yield 'leading dot' => ['.jane'];
        yield 'trailing hyphen' => ['jane-'];
        yield 'consecutive dots' => ['jane..doe'];
        yield 'quoted string' => ['"jane doe"'];
    }

    public function testReservedRoleAddressesBelongToThePlatform(): void
    {
        $this->assertBusinessRule('MAIL_RESERVED_LOCAL_PART', fn () => $this->policy->normalise('PostMaster'));
    }
}

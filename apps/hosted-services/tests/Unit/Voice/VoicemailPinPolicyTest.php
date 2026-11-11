<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Services\Voice\VoicemailPinPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class VoicemailPinPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private VoicemailPinPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new VoicemailPinPolicy(minLength: 4, maxLength: 8);
    }

    #[DataProvider('weakPins')]
    public function testWeakPinsAreRefused(string $pin, string $expectedProblem): void
    {
        self::assertStringContainsString($expectedProblem, (string) $this->policy->problem($pin));
    }

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function weakPins(): iterable
    {
        yield 'letters' => ['12a4', 'digits only'];
        yield 'too short' => ['482', '4 to 8 digits'];
        yield 'too long' => ['482915736', '4 to 8 digits'];
        yield 'single repeated digit' => ['7777', 'single repeated digit'];
        yield 'ascending' => ['3456', 'sequence'];
        yield 'descending' => ['9876', 'sequence'];
        yield 'ascending wrapping past nine' => ['8901', 'sequence'];
        yield 'repeated halves' => ['4848', 'repeated pattern'];
        yield 'repeated triple' => ['258258', 'repeated pattern'];
    }

    public function testPinMayNotMatchTheExtensionOrSitInsideTheDirectNumber(): void
    {
        $forbidden = ['2001', '555-2671'];

        self::assertNotNull($this->policy->problem('2001', $forbidden));
        self::assertNotNull($this->policy->problem('5267', $forbidden));
        self::assertNull($this->policy->problem('5268', $forbidden));
    }

    public function testShortForbiddenValuesOnlyBlockExactMatches(): void
    {
        self::assertNull($this->policy->problem('20013', ['200']));
        self::assertNotNull($this->policy->problem('2013', ['2013']));
    }

    public function testAcceptablePinPassesAndWeakPinIsAFieldError(): void
    {
        $this->policy->assertAcceptable('2580');
        $this->assertFieldError('pin', fn () => $this->policy->assertAcceptable('0000'));
    }
}

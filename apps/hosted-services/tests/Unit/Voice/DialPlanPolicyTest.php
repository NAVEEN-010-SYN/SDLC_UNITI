<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Exceptions\ConflictException;
use App\Services\Voice\DialPlanPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class DialPlanPolicyTest extends TestCase
{
    use AssertsApiExceptions;

    private DialPlanPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new DialPlanPolicy(minDigits: 3, maxDigits: 6, reserved: ['911', '933', '411', '611', '711', '811']);
    }

    #[DataProvider('malformedNumbers')]
    public function testMalformedNumbersAreFieldErrors(string $number): void
    {
        $this->assertFieldError('pilot_extension', fn () => $this->policy->assertAvailable($number, [], 'pilot_extension'));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function malformedNumbers(): iterable
    {
        yield 'too short' => ['12'];
        yield 'too long' => ['1234567'];
        yield 'non-digit' => ['20a1'];
        yield 'empty' => [''];
    }

    #[DataProvider('reservedPrefixes')]
    public function testOperatorAndOutsideLinePrefixesAreReserved(string $number): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED_PREFIX', fn () => $this->policy->assertAvailable($number, []));
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function reservedPrefixes(): iterable
    {
        yield 'operator' => ['0123'];
        yield 'outside line' => ['9100'];
    }

    public function testServiceCodesCannotStartAnExtension(): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED', fn () => $this->policy->assertAvailable('4110', []));
        $this->assertBusinessRule('VOICE_EXTENSION_RESERVED', fn () => $this->policy->assertAvailable('711', []));
    }

    public function testExactDuplicateIsAConflict(): void
    {
        $this->expectException(ConflictException::class);

        $this->policy->assertAvailable('2001', ['2001', '2002']);
    }

    public function testPrefixOverlapWouldMakeDiallingAmbiguous(): void
    {
        $this->assertBusinessRule('VOICE_EXTENSION_PREFIX_OVERLAP', fn () => $this->policy->assertAvailable('200', ['2001']));
        $this->assertBusinessRule('VOICE_EXTENSION_PREFIX_OVERLAP', fn () => $this->policy->assertAvailable('20015', ['2001']));

        $this->policy->assertAvailable('2010', ['2001', '2002']);
        $this->addToAssertionCount(1);
    }

    public function testSuggestReturnsLowestFreeNonOverlappingNumber(): void
    {
        self::assertSame('102', $this->policy->suggest(['100', '101'], 3));
        self::assertSame('101', $this->policy->suggest(['1000'], 3));
        self::assertSame('1000', $this->policy->suggest([], 4));
    }

    public function testSuggestClampsRequestedLengthToPolicy(): void
    {
        self::assertSame('100', $this->policy->suggest([], 1));
        self::assertSame('100000', $this->policy->suggest([], 9));
    }

    public function testSuggestReturnsNullWhenEveryCandidateOverlaps(): void
    {
        $inUse = array_map('strval', range(1, 8));

        self::assertNull($this->policy->suggest($inUse, 3));
    }
}

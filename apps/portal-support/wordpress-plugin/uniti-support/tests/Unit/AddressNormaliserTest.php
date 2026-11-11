<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\Availability\AddressNormaliser;

final class AddressNormaliserTest extends TestCase
{
    private AddressNormaliser $normaliser;

    protected function setUp(): void
    {
        $this->normaliser = new AddressNormaliser();
    }

    public function testNormalisesAddressForLookup(): void
    {
        $result = $this->normaliser->normalise(['line1' => '  120   Main  Street ', 'unit' => '#4b', 'zip' => '78701-1234']);

        self::assertSame([], $result['errors']);
        self::assertSame(['line1' => '120 MAIN ST', 'unit' => '4B', 'zip' => '78701'], $result['address']);
    }

    public function testReportsEveryInvalidField(): void
    {
        $result = $this->normaliser->normalise(['line1' => 'Main Street', 'unit' => '<script>', 'zip' => '7870']);

        self::assertNull($result['address']);
        self::assertSame(['line1', 'zip', 'unit'], array_keys($result['errors']));
    }

    public function testEmptyUnitBecomesNull(): void
    {
        $result = $this->normaliser->normalise(['line1' => '9 Oak Ln', 'zip' => '73301']);

        self::assertNull($result['address']['unit'] ?? 'missing');
    }

    public function testSummarisesServiceablePlansSortedBySpeedWithIntegerMoney(): void
    {
        $summary = $this->normaliser->summarise([
            'status' => 'SERVICEABLE',
            'earliestInstallDate' => '2026-06-02',
            'plans' => [
                ['name' => 'Fibre 1G', 'downMbps' => 1000, 'monthlyPrice' => ['amountMinor' => 6500, 'currency' => 'USD']],
                ['name' => 'Fibre 500', 'downMbps' => 500, 'monthlyPrice' => ['amountMinor' => 4999, 'currency' => 'USD']],
                ['name' => 'Broken', 'downMbps' => 100],
            ],
        ]);

        self::assertTrue($summary['serviceable']);
        self::assertSame('2026-06-02', $summary['installWindow']);
        self::assertSame([
            ['name' => 'Fibre 500', 'speed' => '500 Mbps', 'price' => '$49.99/mo'],
            ['name' => 'Fibre 1G', 'speed' => '1 Gbps', 'price' => '$65.00/mo'],
        ], $summary['plans']);
    }

    public function testNotServiceableWhenStatusSaysSoOrNoPlansParse(): void
    {
        self::assertFalse($this->normaliser->summarise(['status' => 'PLANNED', 'plans' => []])['serviceable']);
        self::assertFalse($this->normaliser->summarise(['status' => 'SERVICEABLE', 'plans' => [['name' => 'x']]])['serviceable']);
    }

    public function testMoneyFormatting(): void
    {
        self::assertSame('$1,234.05', AddressNormaliser::money(123405, 'usd'));
        self::assertSame('-$0.99', AddressNormaliser::money(-99, 'USD'));
        self::assertSame('JPY 12.00', AddressNormaliser::money(1200, 'JPY'));
        self::assertSame('2 Gbps', AddressNormaliser::speed(2000));
        self::assertSame('2500 Mbps', AddressNormaliser::speed(2500));
    }
}

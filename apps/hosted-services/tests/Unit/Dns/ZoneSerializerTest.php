<?php

declare(strict_types=1);

namespace Tests\Unit\Dns;

use App\Enums\DnsRecordType;
use App\Services\Dns\DnsRecordData;
use App\Services\Dns\ZoneSerializer;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class ZoneSerializerTest extends TestCase
{
    private ZoneSerializer $serializer;

    protected function setUp(): void
    {
        $this->serializer = new ZoneSerializer();
    }

    public function testSerializesSortedMasterFileWithRelativeOwners(): void
    {
        $records = [
            new DnsRecordData('www.example.com', DnsRecordType::CNAME, 'example.com', 300),
            new DnsRecordData('example.com', DnsRecordType::MX, 'mx2.uniti.example', 3600, priority: 20),
            new DnsRecordData('example.com', DnsRecordType::A, '203.0.113.10', 3600),
            new DnsRecordData('example.com', DnsRecordType::MX, 'mx1.uniti.example.', 3600, priority: 10),
            new DnsRecordData('_sip._tcp.example.com', DnsRecordType::SRV, 'sip.uniti.example', 3600, priority: 10, weight: 60, port: 5060),
        ];

        $zone = $this->serializer->serialize('Example.COM.', 2026030401, $records, ['ns1.uniti.example', 'ns2.uniti.example.']);

        self::assertSame(implode("\n", [
            '$ORIGIN example.com.',
            '$TTL 3600',
            '@ IN SOA ns1.uniti.example. hostmaster.example.com. ( 2026030401 3600 900 1209600 300 )',
            '@ IN NS ns1.uniti.example.',
            '@ IN NS ns2.uniti.example.',
            '_sip._tcp 3600 IN SRV 10 60 5060 sip.uniti.example.',
            '@ 3600 IN A 203.0.113.10',
            '@ 3600 IN MX 10 mx1.uniti.example.',
            '@ 3600 IN MX 20 mx2.uniti.example.',
            'www 300 IN CNAME example.com.',
        ]) . "\n", $zone);
    }

    public function testTxtValuesAreEscapedAndSplitIntoCharacterStrings(): void
    {
        self::assertSame('"v=spf1 \\"x\\" \\\\"', $this->serializer->quoteTxt('v=spf1 "x" \\'));

        $long = $this->serializer->quoteTxt(str_repeat('a', 300));
        self::assertSame('"' . str_repeat('a', 255) . '" "' . str_repeat('a', 45) . '"', $long);
    }

    public function testCaaAndAddressRecordsAreRenderedVerbatim(): void
    {
        $caa = new DnsRecordData('example.com', DnsRecordType::CAA, '0 issue "letsencrypt.org"', 3600);

        self::assertSame('@ 3600 IN CAA 0 issue "letsencrypt.org"', $this->serializer->line($caa, 'example.com'));
    }

    public function testNextSerialUsesDatePrefixAndNeverGoesBackwards(): void
    {
        $now = new DateTimeImmutable('2026-03-04T12:00:00Z');

        self::assertSame(2026030400, ZoneSerializer::nextSerial(2025123199, $now));
        self::assertSame(2026030406, ZoneSerializer::nextSerial(2026030405, $now));
        self::assertSame(2026031001, ZoneSerializer::nextSerial(2026031000, $now));
        self::assertSame(2026030400, ZoneSerializer::nextSerial(0, $now));
    }
}

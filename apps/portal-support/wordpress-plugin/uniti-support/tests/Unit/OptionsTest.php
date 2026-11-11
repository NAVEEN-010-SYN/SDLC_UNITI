<?php

declare(strict_types=1);

namespace Uniti\Support\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Uniti\Support\Settings\Options;

final class OptionsTest extends TestCase
{
    public function testSanitizeAcceptsValidInputAndClampsNumbers(): void
    {
        $clean = Options::sanitize([
            'api_base_url' => ' https://content-api.uniti.example/v1/ ',
            'api_key' => 'abcDEF1234567890_-.',
            'status_cache_seconds' => '5',
            'banner_min_severity' => 'major',
            'kb_results_per_page' => '500',
            'injected' => 'value',
        ]);

        self::assertSame([
            'api_base_url' => 'https://content-api.uniti.example/v1',
            'api_key' => 'abcDEF1234567890_-.',
            'status_cache_seconds' => 30,
            'banner_min_severity' => 'major',
            'kb_results_per_page' => 50,
        ], $clean);
    }

    public function testRejectsInsecureOrCredentialBearingUrls(): void
    {
        self::assertSame('', Options::sanitize(['api_base_url' => 'http://content-api.uniti.example'])['api_base_url']);
        self::assertSame('', Options::sanitize(['api_base_url' => 'https://user:pw@content-api.uniti.example'])['api_base_url']);
        self::assertSame('', Options::sanitize(['api_base_url' => 'javascript:alert(1)'])['api_base_url']);
    }

    public function testBlankApiKeyKeepsStoredSecret(): void
    {
        $current = Options::defaults();
        $current['api_key'] = 'stored-secret-value-123';

        self::assertSame('stored-secret-value-123', Options::sanitize(['api_key' => ''], $current)['api_key']);
        self::assertSame('stored-secret-value-123', Options::sanitize(['api_key' => 'bad key!'], $current)['api_key']);
    }

    public function testNonArrayInputFallsBackToDefaults(): void
    {
        $clean = Options::sanitize('garbage');

        self::assertSame('minor', $clean['banner_min_severity']);
        self::assertSame(120, $clean['status_cache_seconds']);
    }
}

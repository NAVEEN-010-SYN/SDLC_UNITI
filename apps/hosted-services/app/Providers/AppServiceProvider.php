<?php

declare(strict_types=1);

namespace App\Providers;

use App\Clients\CertificateAuthorityClient;
use App\Clients\MailPlatformClient;
use App\Clients\ProvisioningHttpClient;
use App\Clients\VoicePlatformClient;
use App\Clients\WebHostingClient;
use App\Exceptions\ProblemRenderer;
use App\Services\Dns\DnsRecordValidator;
use App\Services\Dns\DnsZoneService;
use App\Services\Hosting\SslCertificateService;
use App\Services\Mail\LocalPartPolicy;
use App\Services\Mail\MailAliasService;
use App\Services\Mail\MailboxService;
use App\Services\Mail\PasswordGenerator;
use App\Services\Mail\QuotaCalculator;
use App\Services\Porting\PortingStateMachine;
use App\Services\Voice\DialPlanPolicy;
use App\Services\Voice\ForwardingRuleValidator;
use App\Services\Voice\HuntGroupService;
use App\Services\Voice\VoicemailPinPolicy;
use App\Services\Voice\VoicemailService;
use App\Support\JwtDecoder;
use App\Support\SystemClock;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;
use RuntimeException;

/**
 * Wires services whose constructors take tunable scalars from
 * config/hosted.php and gives each provisioning client its own transport.
 * Classes without scalar arguments are left to container autowiring.
 */
final class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ClockInterface::class, SystemClock::class);
        $this->app->singleton(JwtDecoder::class, fn () => JwtDecoder::fromConfig((array) config('auth_jwt')));
        $this->app->singleton(ProblemRenderer::class, fn (Application $app) => new ProblemRenderer(
            logger: $app->make(LoggerInterface::class),
            debug: (bool) config('app.debug', false),
        ));

        $this->registerProvisioningClients();
        $this->registerVoice();
        $this->registerMail();
        $this->registerHostingAndPorting();
    }

    public function boot(): void
    {
        JsonResource::withoutWrapping();
    }

    private function registerProvisioningClients(): void
    {
        $this->app->singleton(VoicePlatformClient::class, function (Application $app) {
            return new VoicePlatformClient($this->transportFor($app, 'voice'));
        });
        $this->app->singleton(MailPlatformClient::class, function (Application $app) {
            return new MailPlatformClient($this->transportFor($app, 'mail'));
        });
        $this->app->singleton(WebHostingClient::class, function (Application $app) {
            return new WebHostingClient($this->transportFor($app, 'webhosting'));
        });
        $this->app->singleton(CertificateAuthorityClient::class, function (Application $app) {
            return new CertificateAuthorityClient($this->transportFor($app, 'certificates'));
        });
    }

    private function transportFor(Application $app, string $platform): ProvisioningHttpClient
    {
        $settings = (array) config("provisioning.$platform");
        $baseUrl = (string) ($settings['base_url'] ?? '');
        if ($baseUrl === '') {
            throw new RuntimeException(sprintf('Provisioning platform "%s" has no base URL configured.', $platform));
        }

        return new ProvisioningHttpClient(
            http: new GuzzleClient(['http_errors' => false]),
            logger: $app->make(LoggerInterface::class),
            platform: $platform,
            baseUrl: $baseUrl,
            apiKey: (string) ($settings['api_key'] ?? ''),
            timeoutSeconds: (float) config('provisioning.timeout_seconds', 10),
            maxRetries: (int) config('provisioning.max_retries', 2),
            backoffMs: (int) config('provisioning.retry_backoff_ms', 250),
        );
    }

    private function registerVoice(): void
    {
        $this->app->singleton(DialPlanPolicy::class, fn () => new DialPlanPolicy(
            minDigits: (int) config('hosted.voice.extension_min_digits'),
            maxDigits: (int) config('hosted.voice.extension_max_digits'),
            reserved: (array) config('hosted.voice.reserved_extensions'),
        ));
        $this->app->singleton(ForwardingRuleValidator::class, fn () => new ForwardingRuleValidator(
            noAnswerMinSeconds: (int) config('hosted.voice.forward_no_answer_seconds_min'),
            noAnswerMaxSeconds: (int) config('hosted.voice.forward_no_answer_seconds_max'),
            maxChainDepth: (int) config('hosted.voice.forward_max_chain_depth'),
        ));
        $this->app->singleton(VoicemailPinPolicy::class, fn () => new VoicemailPinPolicy(
            minLength: (int) config('hosted.voice.voicemail_pin_min_length'),
            maxLength: (int) config('hosted.voice.voicemail_pin_max_length'),
        ));
        $this->app->when(VoicemailService::class)
            ->needs('$maxMessageSeconds')
            ->giveConfig('hosted.voice.voicemail_max_message_seconds');
        $this->app->when(HuntGroupService::class)->needs('$maxMembers')->giveConfig('hosted.voice.hunt_group_max_members');
        $this->app->when(HuntGroupService::class)->needs('$ringSecondsMin')->giveConfig('hosted.voice.hunt_group_ring_seconds_min');
        $this->app->when(HuntGroupService::class)->needs('$ringSecondsMax')->giveConfig('hosted.voice.hunt_group_ring_seconds_max');
    }

    private function registerMail(): void
    {
        $this->app->singleton(QuotaCalculator::class, fn () => QuotaCalculator::fromConfig((array) config('hosted.mail')));
        $this->app->singleton(LocalPartPolicy::class, fn () => new LocalPartPolicy((array) config('hosted.mail.reserved_local_parts')));
        $this->app->singleton(PasswordGenerator::class, fn () => new PasswordGenerator());

        $this->app->when(MailboxService::class)->needs('$allowExternalForwarding')->giveConfig('hosted.mail.allow_external_forwarding');
        $this->app->when(MailboxService::class)->needs('$defaultQuotaMb')->giveConfig('hosted.mail.default_mailbox_quota_mb');
        $this->app->when(MailAliasService::class)->needs('$maxDestinations')->giveConfig('hosted.mail.max_alias_destinations');
        $this->app->when(MailAliasService::class)->needs('$allowExternalForwarding')->giveConfig('hosted.mail.allow_external_forwarding');
    }

    private function registerHostingAndPorting(): void
    {
        $this->app->singleton(DnsRecordValidator::class, fn () => new DnsRecordValidator(
            ttlMin: (int) config('hosted.dns.ttl_min'),
            ttlMax: (int) config('hosted.dns.ttl_max'),
            maxRecordsPerZone: (int) config('hosted.dns.max_records_per_zone'),
        ));
        $this->app->when(DnsZoneService::class)->needs('$defaultTtl')->giveConfig('hosted.dns.ttl_default');
        $this->app->when(SslCertificateService::class)->needs('$maxSans')->giveConfig('hosted.ssl.max_sans');
        $this->app->when(SslCertificateService::class)->needs('$renewalWindowDays')->giveConfig('hosted.ssl.renewal_window_days');

        $this->app->singleton(PortingStateMachine::class, fn () => new PortingStateMachine(
            cancelCutoffHours: (int) config('hosted.porting.cancel_cutoff_hours'),
            maxResubmissions: (int) config('hosted.porting.max_resubmissions'),
            maxNumbersPerRequest: (int) config('hosted.porting.max_numbers_per_request'),
            minLeadBusinessDays: (int) config('hosted.porting.min_lead_days'),
        ));
    }
}

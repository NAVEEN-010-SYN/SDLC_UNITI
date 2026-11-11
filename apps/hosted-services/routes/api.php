<?php

declare(strict_types=1);

/*
 * Hosted Services API, mounted under /api/v1 (see bootstrap/app.php).
 *
 * Every account-scoped route runs auth.jwt (bearer token -> Principal) and
 * account (ACC-######## format + caller entitlement). Reads are open to any
 * role allowed by config/auth_jwt.php; writes additionally require
 * role:manage (BUSINESS_ADMIN, PARTNER_ADMIN or SUPPORT_AGENT).
 */

use App\Http\Controllers\HealthController;
use App\Http\Controllers\Hosting\CertificateController;
use App\Http\Controllers\Hosting\DnsRecordController;
use App\Http\Controllers\Hosting\HostedDomainController;
use App\Http\Controllers\Mail\EmailDomainController;
use App\Http\Controllers\Mail\MailAliasController;
use App\Http\Controllers\Mail\MailboxController;
use App\Http\Controllers\Porting\CarrierUpdateController;
use App\Http\Controllers\Porting\PortingController;
use App\Http\Controllers\Voice\ExtensionController;
use App\Http\Controllers\Voice\HuntGroupController;
use App\Http\Controllers\Voice\NumberController;
use App\Http\Controllers\Voice\VoicemailController;
use Illuminate\Support\Facades\Route;

$uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

Route::get('/health', HealthController::class);

Route::middleware('auth.jwt')->group(function () use ($uuid): void {
    Route::post('/internal/porting/carrier-updates', CarrierUpdateController::class)
        ->middleware('role:SUPPORT_AGENT');

    Route::prefix('/accounts/{accountId}')
        ->middleware('account')
        ->where([
            'extensionId' => $uuid,
            'groupId' => $uuid,
            'numberId' => $uuid,
            'requestId' => $uuid,
            'domainId' => $uuid,
            'mailboxId' => $uuid,
            'aliasId' => $uuid,
            'recordId' => $uuid,
            'certificateId' => $uuid,
        ])
        ->group(function (): void {
            // Hosted voice: extensions, forwarding, voicemail
            Route::get('/extensions', [ExtensionController::class, 'index']);
            Route::get('/extensions/{extensionId}', [ExtensionController::class, 'show']);
            Route::get('/extensions/{extensionId}/forwarding-rules', [ExtensionController::class, 'forwardingRules']);
            Route::get('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'show']);

            // Hosted voice: hunt groups and numbers
            Route::get('/hunt-groups', [HuntGroupController::class, 'index']);
            Route::get('/hunt-groups/{groupId}', [HuntGroupController::class, 'show']);
            Route::get('/numbers', [NumberController::class, 'index']);
            Route::get('/numbers/available', [NumberController::class, 'available']);
            Route::get('/numbers/{numberId}', [NumberController::class, 'show']);

            // Number porting
            Route::get('/porting-requests', [PortingController::class, 'index']);
            Route::get('/porting-requests/{requestId}', [PortingController::class, 'show']);

            // Hosted email
            Route::get('/email-domains', [EmailDomainController::class, 'index']);
            Route::get('/email-domains/{domainId}', [EmailDomainController::class, 'show']);
            Route::get('/email-domains/{domainId}/mailboxes', [MailboxController::class, 'index']);
            Route::get('/email-domains/{domainId}/aliases', [MailAliasController::class, 'index']);
            Route::get('/mailboxes/{mailboxId}', [MailboxController::class, 'show']);

            // Web hosting, DNS and certificates
            Route::get('/domains', [HostedDomainController::class, 'index']);
            Route::get('/domains/{domainId}', [HostedDomainController::class, 'show']);
            Route::get('/domains/{domainId}/dns-records', [DnsRecordController::class, 'index']);
            Route::get('/domains/{domainId}/zone-file', [DnsRecordController::class, 'export']);
            Route::get('/domains/{domainId}/certificates', [CertificateController::class, 'index']);

            Route::middleware('role:manage')->group(function (): void {
                Route::post('/extensions', [ExtensionController::class, 'store']);
                Route::patch('/extensions/{extensionId}', [ExtensionController::class, 'update']);
                Route::delete('/extensions/{extensionId}', [ExtensionController::class, 'destroy']);
                Route::put('/extensions/{extensionId}/forwarding-rules', [ExtensionController::class, 'replaceForwardingRules']);
                Route::put('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'update']);
                Route::delete('/extensions/{extensionId}/voicemail', [VoicemailController::class, 'destroy']);

                Route::post('/hunt-groups', [HuntGroupController::class, 'store']);
                Route::put('/hunt-groups/{groupId}', [HuntGroupController::class, 'update']);
                Route::delete('/hunt-groups/{groupId}', [HuntGroupController::class, 'destroy']);

                Route::post('/numbers/orders', [NumberController::class, 'order']);
                Route::patch('/numbers/{numberId}', [NumberController::class, 'update']);
                Route::delete('/numbers/{numberId}', [NumberController::class, 'destroy']);

                Route::post('/porting-requests', [PortingController::class, 'store']);
                Route::patch('/porting-requests/{requestId}', [PortingController::class, 'update']);
                Route::post('/porting-requests/{requestId}/submit', [PortingController::class, 'submit']);
                Route::post('/porting-requests/{requestId}/cancel', [PortingController::class, 'cancel']);
                Route::post('/porting-requests/{requestId}/reopen', [PortingController::class, 'reopen']);

                Route::post('/email-domains', [EmailDomainController::class, 'store']);
                Route::post('/email-domains/{domainId}/verify-mx', [EmailDomainController::class, 'verifyMx']);
                Route::put('/email-domains/{domainId}/storage', [EmailDomainController::class, 'setStorage']);
                Route::post('/email-domains/{domainId}/mailboxes', [MailboxController::class, 'store']);
                Route::post('/email-domains/{domainId}/aliases', [MailAliasController::class, 'store']);
                Route::patch('/email-domains/{domainId}/aliases/{aliasId}', [MailAliasController::class, 'update']);
                Route::delete('/email-domains/{domainId}/aliases/{aliasId}', [MailAliasController::class, 'destroy']);
                Route::patch('/mailboxes/{mailboxId}', [MailboxController::class, 'update']);
                Route::post('/mailboxes/{mailboxId}/reset-password', [MailboxController::class, 'resetPassword']);
                Route::delete('/mailboxes/{mailboxId}', [MailboxController::class, 'destroy']);

                Route::post('/domains', [HostedDomainController::class, 'store']);
                Route::post('/domains/{domainId}/check-delegation', [HostedDomainController::class, 'checkDelegation']);
                Route::delete('/domains/{domainId}', [HostedDomainController::class, 'destroy']);
                Route::post('/domains/{domainId}/dns-records', [DnsRecordController::class, 'store']);
                Route::patch('/domains/{domainId}/dns-records/{recordId}', [DnsRecordController::class, 'update']);
                Route::delete('/domains/{domainId}/dns-records/{recordId}', [DnsRecordController::class, 'destroy']);
                Route::post('/domains/{domainId}/certificates', [CertificateController::class, 'store']);
                Route::patch('/domains/{domainId}/certificates/{certificateId}', [CertificateController::class, 'update']);
                Route::post('/domains/{domainId}/certificates/{certificateId}/revoke', [CertificateController::class, 'revoke']);
            });
        });
});

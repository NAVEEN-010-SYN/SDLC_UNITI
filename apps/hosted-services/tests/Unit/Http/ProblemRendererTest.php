<?php

declare(strict_types=1);

namespace Tests\Unit\Http;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\ProblemRenderer;
use App\Exceptions\ValidationFailedException;
use App\Http\Middleware\CorrelationId;
use App\Support\FieldCase;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use RuntimeException;

final class ProblemRendererTest extends TestCase
{
    private ProblemRenderer $renderer;
    private Request $request;

    protected function setUp(): void
    {
        $this->renderer = new ProblemRenderer(new NullLogger(), 'https://errors.test/hosted/');
        $this->request = Request::create('/api/v1/accounts/ACC-12345678/hunt-groups', 'POST');
        $this->request->attributes->set(CorrelationId::ATTRIBUTE, 'corr-12345678');
    }

    public function testValidationProblemUsesCamelCaseFieldPaths(): void
    {
        $response = $this->renderer->render(ValidationFailedException::withErrors([
            'no_answer_destination' => ['Overflow cannot route back to the hunt group itself.'],
            'members.2.ring_seconds' => ['Ring time must be between 5 and 120 seconds.'],
        ]), $this->request);

        $body = $response->getData(true);
        self::assertSame(400, $response->getStatusCode());
        self::assertSame(ProblemRenderer::CONTENT_TYPE, $response->headers->get('Content-Type'));
        self::assertSame('https://errors.test/hosted/validation-error', $body['type']);
        self::assertSame('/api/v1/accounts/ACC-12345678/hunt-groups', $body['instance']);
        self::assertSame('corr-12345678', $body['correlationId']);
        self::assertSame(['noAnswerDestination', 'members.2.ringSeconds'], array_keys($body['errors']));
    }

    public function testBusinessRuleCarriesStableRuleCode(): void
    {
        $response = $this->renderer->render(
            new BusinessRuleException('Pool exhausted.', 'MAIL_POOL_EXHAUSTED', ['shortfallMb' => 512]),
            $this->request,
        );

        $body = $response->getData(true);
        self::assertSame(422, $response->getStatusCode());
        self::assertSame('MAIL_POOL_EXHAUSTED', $body['rule']);
        self::assertSame(512, $body['shortfallMb']);
    }

    public function testUnexpectedErrorsAreOpaque(): void
    {
        $response = $this->renderer->render(new RuntimeException('SQLSTATE[08006] password=hunter2'), $this->request);

        $body = $response->getData(true);
        self::assertSame(500, $response->getStatusCode());
        self::assertStringNotContainsString('hunter2', (string) $response->getContent());
        self::assertArrayNotHasKey('debugMessage', $body);
    }

    public function testFieldCaseRoundTrip(): void
    {
        self::assertSame(
            ['service_address' => ['postal_code' => '94107'], 'numbers' => ['+14155550101']],
            FieldCase::snake(['serviceAddress' => ['postalCode' => '94107'], 'numbers' => ['+14155550101']]),
        );
        self::assertSame('rules.0.destinationType', FieldCase::camelPath('rules.0.destination_type'));
        self::assertSame(
            ['quotaMb' => ['a', 'b']],
            FieldCase::camelErrors(['quota_mb' => ['a'], 'quotaMb' => ['b']]),
        );
    }
}

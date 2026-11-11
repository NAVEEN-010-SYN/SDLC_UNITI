<?php

declare(strict_types=1);

namespace Tests\Unit\Voice;

use App\Enums\ForwardingCondition;
use App\Services\Voice\ForwardingRuleValidator;
use PHPUnit\Framework\TestCase;
use Tests\Unit\AssertsApiExceptions;

final class ForwardingRuleValidatorTest extends TestCase
{
    use AssertsApiExceptions;

    private const OWNER = '2001';
    private const DIAL_PLAN = ['2001', '2002', '2003', '2004'];

    private ForwardingRuleValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new ForwardingRuleValidator(noAnswerMinSeconds: 5, noAnswerMaxSeconds: 60, maxChainDepth: 5);
    }

    public function testValidRuleSetIsNormalisedAndOrderedByPrecedence(): void
    {
        $rules = $this->validator->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'EXTENSION', 'destination' => '2002', 'ring_seconds' => 20],
            ['condition' => 'BUSY', 'destination_type' => 'VOICEMAIL', 'destination' => 'ignored', 'ring_seconds' => 30],
            ['condition' => 'UNREACHABLE', 'destination_type' => 'EXTERNAL', 'destination' => ' (415) 555-2671 ', 'enabled' => false],
        ], self::OWNER, self::DIAL_PLAN, []);

        self::assertSame(
            [ForwardingCondition::Unreachable, ForwardingCondition::Busy, ForwardingCondition::NoAnswer],
            array_column($rules, 'condition'),
        );
        self::assertSame('+14155552671', $rules[0]['destination']);
        self::assertFalse($rules[0]['enabled']);
        self::assertNull($rules[1]['destination']);
        self::assertNull($rules[1]['ring_seconds'], 'Ring time only applies to NO_ANSWER.');
        self::assertSame(20, $rules[2]['ring_seconds']);
        self::assertTrue($rules[2]['enabled']);
    }

    public function testEachConditionMayAppearOnlyOnce(): void
    {
        $this->assertFieldError('rules.1.condition', fn () => $this->validate([
            ['condition' => 'BUSY', 'destination_type' => 'VOICEMAIL'],
            ['condition' => 'BUSY', 'destination_type' => 'EXTENSION', 'destination' => '2002'],
        ]));
    }

    public function testUnknownConditionAndDestinationTypeAreReported(): void
    {
        $this->assertFieldError('rules.0.condition', fn () => $this->validate([['condition' => 'SOMETIMES', 'destination_type' => 'VOICEMAIL']]));
        $this->assertFieldError('rules.0.destination_type', fn () => $this->validate([['condition' => 'ALWAYS', 'destination_type' => 'FAX']]));
    }

    public function testInternalDestinationMustExistAndNotBeTheOwner(): void
    {
        $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2999'],
        ]));
        $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => self::OWNER],
        ]));
    }

    public function testExternalDestinationsExcludePremiumRateAndInternational(): void
    {
        $premium = $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '900-555-1234'],
        ]));
        self::assertStringContainsString('premium-rate', $premium[0]);

        $international = $this->assertFieldError('rules.0.destination', fn () => $this->validate([
            ['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '+44 20 7946 0000'],
        ]));
        self::assertStringContainsString('International', $international[0]);
    }

    public function testInternationalForwardingCanBeEnabled(): void
    {
        $validator = new ForwardingRuleValidator(allowInternational: true);

        $rules = $validator->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTERNAL', 'destination' => '+44 20 7946 0000']],
            self::OWNER,
            self::DIAL_PLAN,
            [],
        );

        self::assertSame('+442079460000', $rules[0]['destination']);
    }

    public function testNoAnswerRingTimeIsRequiredAndSteppedInFiveSeconds(): void
    {
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL'],
        ]));
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL', 'ring_seconds' => 17],
        ]));
        $this->assertFieldError('rules.0.ring_seconds', fn () => $this->validate([
            ['condition' => 'NO_ANSWER', 'destination_type' => 'VOICEMAIL', 'ring_seconds' => 65],
        ]));
    }

    public function testForwardingLoopAcrossExtensionsIsRejectedWithTheCycle(): void
    {
        $graph = ['2002' => ['2003'], '2003' => [self::OWNER]];

        $extensions = $this->assertBusinessRule('VOICE_FORWARDING_LOOP', fn () => $this->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002']],
            $graph,
        ));

        self::assertSame([self::OWNER, '2002', '2003', self::OWNER], $extensions['cycle']);
    }

    public function testDisabledRulesDoNotParticipateInLoopDetection(): void
    {
        $graph = ['2002' => [self::OWNER]];

        $rules = $this->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002', 'enabled' => false]],
            $graph,
        );

        self::assertCount(1, $rules);
    }

    public function testExistingOutgoingEdgesOfTheOwnerAreReplacedNotMerged(): void
    {
        $graph = [self::OWNER => ['2002'], '2002' => ['2004']];

        $rules = $this->validate([['condition' => 'BUSY', 'destination_type' => 'EXTENSION', 'destination' => '2003']], $graph);

        self::assertSame('2003', $rules[0]['destination']);
    }

    public function testChainsDeeperThanTheSwitchFollowsAreRejected(): void
    {
        $validator = new ForwardingRuleValidator(maxChainDepth: 2);

        $this->assertBusinessRule('VOICE_FORWARDING_TOO_DEEP', fn () => $validator->validate(
            [['condition' => 'ALWAYS', 'destination_type' => 'EXTENSION', 'destination' => '2002']],
            self::OWNER,
            self::DIAL_PLAN,
            ['2002' => ['2003'], '2003' => ['2004']],
        ));
    }

    /**
     * @param list<array<string, mixed>>  $rules
     * @param array<string, list<string>> $graph
     * @return list<array<string, mixed>>
     */
    private function validate(array $rules, array $graph = []): array
    {
        return $this->validator->validate($rules, self::OWNER, self::DIAL_PLAN, $graph);
    }
}

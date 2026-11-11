<?php

declare(strict_types=1);

namespace App\Services\Voice;

use App\Enums\ForwardingCondition;
use App\Exceptions\BusinessRuleException;
use App\Exceptions\ValidationFailedException;
use App\Models\CallForwardingRule;
use App\Support\PhoneNumber;

/**
 * Validates a complete forwarding rule set for one extension and detects
 * forwarding loops across the account's internal forwarding graph.
 *
 * Pure: the caller supplies the dial plan and the current graph.
 */
final class ForwardingRuleValidator
{
    public function __construct(
        private readonly int $noAnswerMinSeconds = 5,
        private readonly int $noAnswerMaxSeconds = 60,
        private readonly int $maxChainDepth = 5,
        private readonly bool $allowInternational = false,
    ) {
    }

    /**
     * @param list<array{condition: string, destination_type: string, destination?: ?string, ring_seconds?: ?int, enabled?: bool}> $rules
     * @param string                        $extensionNumber Owner of the rules.
     * @param list<string>                  $dialPlan        Extension numbers that exist on the account.
     * @param array<string, list<string>>   $graph           Current internal forwarding edges.
     * @return list<array{condition: ForwardingCondition, destination_type: string, destination: ?string, ring_seconds: ?int, enabled: bool}>
     */
    public function validate(array $rules, string $extensionNumber, array $dialPlan, array $graph): array
    {
        $errors = [];
        $normalised = [];
        $seen = [];

        foreach ($rules as $i => $rule) {
            $prefix = "rules.$i";
            $condition = ForwardingCondition::tryFrom((string) ($rule['condition'] ?? ''));
            if ($condition === null) {
                $errors["$prefix.condition"][] = 'Unknown forwarding condition.';
                continue;
            }
            if (isset($seen[$condition->value])) {
                $errors["$prefix.condition"][] = sprintf('Only one %s rule is allowed.', $condition->value);
                continue;
            }
            $seen[$condition->value] = true;

            $type = (string) ($rule['destination_type'] ?? '');
            $destination = isset($rule['destination']) ? trim((string) $rule['destination']) : null;
            $ringSeconds = isset($rule['ring_seconds']) ? (int) $rule['ring_seconds'] : null;

            $destination = $this->checkDestination($type, $destination, $extensionNumber, $dialPlan, $prefix, $errors);

            if ($condition === ForwardingCondition::NoAnswer) {
                $this->checkRingSeconds($ringSeconds, $prefix, $errors);
            } else {
                $ringSeconds = null;
            }

            $normalised[] = [
                'condition' => $condition,
                'destination_type' => $type,
                'destination' => $destination,
                'ring_seconds' => $ringSeconds,
                'enabled' => (bool) ($rule['enabled'] ?? true),
            ];
        }

        if ($errors !== []) {
            throw ValidationFailedException::withErrors($errors);
        }

        $this->assertNoLoop($extensionNumber, $normalised, $graph);

        usort($normalised, [self::class, 'compareByPrecedence']);

        return $normalised;
    }

    /**
     * @param array{condition: ForwardingCondition} $a
     * @param array{condition: ForwardingCondition} $b
     */
    public static function compareByPrecedence(array $a, array $b): int
    {
        return $a['condition']->precedence() <=> $b['condition']->precedence();
    }

    /**
     * Returns the normalised destination; adds field errors on failure.
     *
     * @param list<string>                $dialPlan
     * @param array<string, list<string>> $errors
     */
    private function checkDestination(
        string $type,
        ?string $destination,
        string $extensionNumber,
        array $dialPlan,
        string $prefix,
        array &$errors,
    ): ?string {
        if ($type === CallForwardingRule::DEST_VOICEMAIL) {
            return null;
        }

        if ($type === CallForwardingRule::DEST_EXTENSION) {
            if ($destination === null || !in_array($destination, $dialPlan, true)) {
                $errors["$prefix.destination"][] = 'Destination extension does not exist on this account.';
            } elseif ($destination === $extensionNumber) {
                $errors["$prefix.destination"][] = 'An extension cannot forward to itself.';
            }

            return $destination;
        }

        if ($type === CallForwardingRule::DEST_EXTERNAL) {
            $number = $destination === null ? null : PhoneNumber::tryParse($destination);
            if ($number === null) {
                $errors["$prefix.destination"][] = 'Destination must be a valid phone number.';
            } elseif ($number->isPremiumRate()) {
                $errors["$prefix.destination"][] = 'Forwarding to premium-rate numbers is not permitted.';
            } elseif (!$number->isNanp() && !$this->allowInternational) {
                $errors["$prefix.destination"][] = 'International forwarding is not enabled on this account.';
            } else {
                return $number->e164;
            }

            return $destination;
        }

        $errors["$prefix.destination_type"][] = 'Destination type must be EXTENSION, EXTERNAL or VOICEMAIL.';

        return $destination;
    }

    /**
     * @param array<string, list<string>> $errors
     */
    private function checkRingSeconds(?int $ringSeconds, string $prefix, array &$errors): void
    {
        if ($ringSeconds === null) {
            $errors["$prefix.ring_seconds"][] = 'Ring time is required for NO_ANSWER forwarding.';
            return;
        }

        $inRange = $ringSeconds >= $this->noAnswerMinSeconds && $ringSeconds <= $this->noAnswerMaxSeconds;
        if (!$inRange || $ringSeconds % 5 !== 0) {
            $errors["$prefix.ring_seconds"][] = sprintf(
                'Ring time must be a multiple of 5 between %d and %d seconds.',
                $this->noAnswerMinSeconds,
                $this->noAnswerMaxSeconds,
            );
        }
    }

    /**
     * Replace this extension's outgoing edges with the proposed ones and
     * walk the graph. A cycle, or a chain deeper than the switch will
     * follow, is rejected.
     *
     * @param list<array{condition: ForwardingCondition, destination_type: string, destination: ?string, enabled: bool}> $rules
     * @param array<string, list<string>> $graph
     */
    private function assertNoLoop(string $extensionNumber, array $rules, array $graph): void
    {
        $graph[$extensionNumber] = [];
        foreach ($rules as $rule) {
            if ($rule['enabled'] && $rule['destination_type'] === CallForwardingRule::DEST_EXTENSION && $rule['destination'] !== null) {
                $graph[$extensionNumber][] = $rule['destination'];
            }
        }

        $path = [$extensionNumber];
        $this->walk($extensionNumber, $graph, $path);
    }

    /**
     * @param array<string, list<string>> $graph
     * @param list<string>                $path
     */
    private function walk(string $node, array $graph, array $path): void
    {
        foreach ($graph[$node] ?? [] as $next) {
            if (in_array($next, $path, true)) {
                $start = (int) array_search($next, $path, true);
                $cycle = array_slice($path, $start);
                $cycle[] = $next;
                throw new BusinessRuleException(
                    'These forwarding rules would create a loop: ' . implode(' -> ', $cycle) . '.',
                    'VOICE_FORWARDING_LOOP',
                    ['cycle' => $cycle],
                );
            }

            $nextPath = $path;
            $nextPath[] = $next;
            if (count($nextPath) - 1 > $this->maxChainDepth) {
                throw new BusinessRuleException(
                    sprintf('Forwarding chains may not exceed %d hops.', $this->maxChainDepth),
                    'VOICE_FORWARDING_TOO_DEEP',
                    ['chain' => $nextPath],
                );
            }

            $this->walk($next, $graph, $nextPath);
        }
    }
}

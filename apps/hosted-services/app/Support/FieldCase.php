<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * The wire format is camelCase JSON while services and models use
 * snake_case attribute names. Conversion happens exactly twice: request
 * bodies on the way in (ApiFormRequest) and field paths in validation
 * problems on the way out (ProblemRenderer).
 */
final class FieldCase
{
    /**
     * Recursively convert associative keys to snake_case; list keys are kept.
     *
     * @param array<mixed> $input
     * @return array<mixed>
     */
    public static function snake(array $input): array
    {
        $result = [];
        foreach ($input as $key => $value) {
            $converted = is_string($key) ? Str::snake($key) : $key;
            if (is_array($value)) {
                $value = self::snake($value);
            }
            $result[$converted] = $value;
        }

        return $result;
    }

    /**
     * "members.0.ring_seconds" -> "members.0.ringSeconds"
     */
    public static function camelPath(string $path): string
    {
        $segments = [];
        foreach (explode('.', $path) as $segment) {
            if (ctype_digit($segment) || $segment === '*') {
                $segments[] = $segment;
            } else {
                $segments[] = Str::camel($segment);
            }
        }

        return implode('.', $segments);
    }

    /**
     * @param array<string, list<string>> $errors
     * @return array<string, list<string>>
     */
    public static function camelErrors(array $errors): array
    {
        $result = [];
        foreach ($errors as $field => $messages) {
            $key = self::camelPath((string) $field);
            $result[$key] = array_values(array_merge($result[$key] ?? [], $messages));
        }

        return $result;
    }
}

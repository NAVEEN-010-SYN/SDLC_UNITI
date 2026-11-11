<?php

declare(strict_types=1);

namespace Uniti\Support\KnowledgeBase;

/**
 * Pure search helpers: normalising the search term and producing a
 * plain-text snippet centred on the first matching term. Kept free of
 * WordPress so ranking/snippet behaviour is unit tested.
 */
final class SearchQuery
{
    public const MIN_TERM_LENGTH = 2;
    public const MAX_TERMS = 8;

    private const STOP_WORDS = ['a', 'an', 'and', 'how', 'i', 'is', 'my', 'of', 'on', 'or', 'the', 'to', 'do', 'can', 'what', 'why'];

    /**
     * @return list<string> Lower-case distinct terms, stop words removed.
     */
    public static function terms(string $query): array
    {
        $words = preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $terms = [];
        foreach ($words as $word) {
            if (mb_strlen($word) < self::MIN_TERM_LENGTH || in_array($word, self::STOP_WORDS, true)) {
                continue;
            }
            $terms[$word] = true;
        }

        return array_slice(array_keys($terms), 0, self::MAX_TERMS);
    }

    /**
     * @param list<string> $terms
     */
    public static function snippet(string $html, array $terms, int $length = 180): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
        if (mb_strlen($text) <= $length) {
            return $text;
        }

        $position = null;
        $lower = mb_strtolower($text);
        foreach ($terms as $term) {
            $found = mb_strpos($lower, $term);
            if ($found !== false && ($position === null || $found < $position)) {
                $position = $found;
            }
        }

        $start = $position === null ? 0 : max(0, $position - intdiv($length, 3));
        if ($start > 0) {
            $space = mb_strpos($text, ' ', $start);
            $start = $space === false ? $start : $space + 1;
        }

        $excerpt = mb_substr($text, $start, $length);
        $cut = mb_strrpos($excerpt, ' ');
        if ($start + $length < mb_strlen($text) && $cut !== false && $cut > intdiv($length, 2)) {
            $excerpt = mb_substr($excerpt, 0, $cut);
        }

        // Ellipsis (U+2026) marks text cut at either end.
        $ellipsis = "\u{2026}";
        $cutAtEnd = $start + mb_strlen($excerpt) < mb_strlen($text);
        if ($start > 0) {
            $excerpt = $ellipsis . $excerpt;
        }
        if ($cutAtEnd) {
            $excerpt .= $ellipsis;
        }

        return $excerpt;
    }

    /**
     * Title matches outrank body matches; every term found counts.
     *
     * @param list<string> $terms
     */
    public static function score(string $title, string $body, array $terms): int
    {
        $title = mb_strtolower($title);
        $body = mb_strtolower(strip_tags($body));
        $score = 0;
        foreach ($terms as $term) {
            $score += str_contains($title, $term) ? 5 : 0;
            $score += min(3, substr_count($body, $term));
        }

        return $score;
    }
}

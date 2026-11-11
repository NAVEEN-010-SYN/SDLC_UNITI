<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Hostname helpers shared by DNS, domain and certificate logic.
 * All comparisons are on the lower-cased, trailing-dot-free form.
 */
final class Hostname
{
    public const MAX_LENGTH = 253;
    public const MAX_LABEL_LENGTH = 63;

    public static function normalise(string $name): string
    {
        $name = strtolower(trim($name));

        return rtrim($name, '.');
    }

    /**
     * RFC 1123 hostname, optionally allowing a leading wildcard label and
     * underscore-prefixed labels (needed for SRV, DKIM, ACME challenges).
     */
    public static function isValid(string $name, bool $allowWildcard = false, bool $allowUnderscore = false): bool
    {
        $name = self::normalise($name);
        if ($name === '' || strlen($name) > self::MAX_LENGTH) {
            return false;
        }

        $labels = explode('.', $name);
        foreach ($labels as $index => $label) {
            if ($allowWildcard && $index === 0 && $label === '*') {
                continue;
            }
            if (!self::isValidLabel($label, $allowUnderscore)) {
                return false;
            }
        }

        return true;
    }

    public static function isValidLabel(string $label, bool $allowUnderscore = false): bool
    {
        $length = strlen($label);
        if ($length === 0 || $length > self::MAX_LABEL_LENGTH) {
            return false;
        }

        $pattern = $allowUnderscore
            ? '/^_?[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'
            : '/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/';

        return preg_match($pattern, $label) === 1;
    }

    /**
     * A registrable domain needs at least two labels and an alphabetic TLD.
     */
    public static function isRegistrableDomain(string $name): bool
    {
        $name = self::normalise($name);
        if (!self::isValid($name)) {
            return false;
        }

        $labels = explode('.', $name);
        if (count($labels) < 2) {
            return false;
        }

        return preg_match('/^[a-z]{2,63}$/', end($labels)) === 1;
    }

    /**
     * Expand a record name relative to its zone: "@" and "" mean the apex,
     * a name already ending in the zone is accepted as fully qualified.
     */
    public static function qualify(string $name, string $zone): string
    {
        $zone = self::normalise($zone);
        $name = self::normalise($name);

        if ($name === '' || $name === '@') {
            return $zone;
        }

        if ($name === $zone || str_ends_with($name, '.' . $zone)) {
            return $name;
        }

        return $name . '.' . $zone;
    }

    /**
     * Inverse of qualify(): the label(s) relative to the zone, "@" for apex.
     */
    public static function relativise(string $fqdn, string $zone): string
    {
        $fqdn = self::normalise($fqdn);
        $zone = self::normalise($zone);

        if ($fqdn === $zone) {
            return '@';
        }

        return str_ends_with($fqdn, '.' . $zone)
            ? substr($fqdn, 0, -strlen('.' . $zone))
            : $fqdn;
    }

    public static function isWithinZone(string $fqdn, string $zone): bool
    {
        $fqdn = self::normalise($fqdn);
        $zone = self::normalise($zone);

        return $fqdn === $zone || str_ends_with($fqdn, '.' . $zone);
    }

    /**
     * Does a certificate name (possibly "*.example.com") cover the host?
     * Wildcards match exactly one label, per RFC 6125.
     */
    public static function matchesCertificateName(string $certName, string $host): bool
    {
        $certName = self::normalise($certName);
        $host = self::normalise($host);

        if (!str_starts_with($certName, '*.')) {
            return $certName === $host;
        }

        $suffix = substr($certName, 1);
        if (!str_ends_with($host, $suffix)) {
            return false;
        }

        $leftmost = substr($host, 0, -strlen($suffix));

        return $leftmost !== '' && !str_contains($leftmost, '.');
    }
}

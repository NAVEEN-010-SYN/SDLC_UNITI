<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Base class for every exception that maps cleanly onto an RFC 7807
 * problem document. Subclasses fix the HTTP status and problem type;
 * callers supply the human-readable detail and optional extension members.
 */
abstract class ApiException extends RuntimeException
{
    /** @var array<string, mixed> */
    private array $extensions;

    /**
     * @param array<string, mixed> $extensions Extra problem members (e.g. "errors", "currentStatus").
     */
    public function __construct(string $detail, array $extensions = [], ?Throwable $previous = null)
    {
        parent::__construct($detail, 0, $previous);
        $this->extensions = $extensions;
    }

    abstract public function status(): int;

    /**
     * Short, stable slug appended to the problem type base URI.
     */
    abstract public function problemType(): string;

    abstract public function title(): string;

    public function detail(): string
    {
        return $this->getMessage();
    }

    /**
     * @return array<string, mixed>
     */
    public function extensions(): array
    {
        return $this->extensions;
    }
}

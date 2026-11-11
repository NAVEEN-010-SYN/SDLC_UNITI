<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Enums\PortingStatus;
use App\Models\PortingEvent;
use App\Models\PortingRequest;
use App\Support\Page;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * @extends AccountScopedRepository<PortingRequest>
 */
class PortingRequestRepository extends AccountScopedRepository
{
    protected function modelClass(): string
    {
        return PortingRequest::class;
    }

    protected function resourceName(): string
    {
        return 'Porting request';
    }

    /**
     * @return Page<PortingRequest>
     */
    public function list(string $accountId, int $page, int $pageSize, ?PortingStatus $status = null): Page
    {
        $query = $this->forAccount($accountId)->orderByDesc('created_at');
        if ($status !== null) {
            $query->where('status', $status->value);
        }

        return $this->paginate($query, $page, $pageSize);
    }

    public function findByCarrierReference(string $reference): ?PortingRequest
    {
        return $this->query()->where('carrier_reference', $reference)->first();
    }

    /**
     * Numbers that are already part of an in-flight port on any account.
     *
     * @param list<string> $numbers
     * @return list<string>
     */
    public function numbersInFlight(array $numbers, ?string $excludeRequestId = null): array
    {
        $open = [
            PortingStatus::Submitted->value,
            PortingStatus::PendingFoc->value,
            PortingStatus::FocReceived->value,
        ];

        $query = $this->query()->whereIn('status', $open);
        if ($excludeRequestId !== null) {
            $query->whereKeyNot($excludeRequestId);
        }

        $inFlight = [];
        foreach ($query->get(['id', 'numbers']) as $request) {
            foreach ($request->numbers as $number) {
                $inFlight[$number] = true;
            }
        }

        return array_values(array_filter($numbers, static fn (string $n) => isset($inFlight[$n])));
    }

    /**
     * Persist the new status together with its audit event, atomically.
     *
     * @param array<string, mixed> $changes Extra columns to update.
     */
    public function recordTransition(
        PortingRequest $request,
        PortingStatus $to,
        string $actor,
        ?string $note,
        CarbonImmutable $at,
        array $changes = [],
    ): PortingRequest {
        return DB::transaction(function () use ($request, $to, $actor, $note, $at, $changes): PortingRequest {
            $from = $request->status;
            $request->fill($changes);
            $request->status = $to;
            $request->save();

            PortingEvent::query()->create([
                'porting_request_id' => $request->id,
                'from_status' => $from,
                'to_status' => $to,
                'actor' => $actor,
                'note' => $note,
                'occurred_at' => $at,
            ]);

            return $request;
        });
    }
}

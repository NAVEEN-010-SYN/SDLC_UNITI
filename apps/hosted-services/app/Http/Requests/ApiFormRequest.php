<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Support\FieldCase;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

/**
 * Base for every JSON body validator.
 *
 * - Authorisation is enforced by route middleware (auth.jwt, account, role),
 *   so authorize() is always true here.
 * - Clients send camelCase; keys are converted to the snake_case attribute
 *   names used by services before validation runs.
 * - Unknown top-level fields are rejected: a typo such as "quotaMB" instead
 *   of "quotaMb" must fail loudly rather than be silently ignored.
 * - Failures raise ValidationException, which ProblemRenderer turns into a
 *   400 application/problem+json document with an "errors" map.
 */
abstract class ApiFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    abstract public function rules(): array;

    protected function prepareForValidation(): void
    {
        $source = $this->isJson() ? $this->json()->all() : $this->query->all();
        $this->replace(FieldCase::snake($source));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $allowed = $this->allowedTopLevelFields();
            foreach (array_keys($this->json()->all()) as $field) {
                if (!in_array((string) $field, $allowed, true)) {
                    $validator->errors()->add((string) $field, 'This field is not recognised.');
                }
            }
        });
    }

    /**
     * Validated input restricted to the keys the client actually sent, so
     * PATCH semantics ("absent" vs "explicit null") survive into services.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        $validated = $this->validated();
        $sent = $this->json()->all();

        return array_intersect_key($validated, $sent);
    }

    /**
     * Derive PATCH rules from create rules: top-level fields become
     * "sometimes" and lose "required"; nested rules are kept as-is so a
     * supplied array is still validated element by element.
     *
     * @param array<string, list<mixed>> $rules
     * @param list<string>               $immutable Fields that may not change after creation.
     * @return array<string, list<mixed>>
     */
    protected static function partial(array $rules, array $immutable = []): array
    {
        $result = [];
        foreach ($rules as $field => $fieldRules) {
            $topLevel = !str_contains($field, '.');
            if ($topLevel && in_array($field, $immutable, true)) {
                $result[$field] = ['prohibited'];
                continue;
            }
            if ($topLevel) {
                $fieldRules = ['sometimes', ...array_values(array_filter($fieldRules, static fn ($r) => $r !== 'required'))];
            }
            $result[$field] = $fieldRules;
        }

        return $result;
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new ValidationException($validator);
    }

    /**
     * @return list<string>
     */
    private function allowedTopLevelFields(): array
    {
        $fields = [];
        foreach (array_keys($this->rules()) as $rule) {
            $fields[] = explode('.', (string) $rule, 2)[0];
        }

        return array_values(array_unique($fields));
    }
}

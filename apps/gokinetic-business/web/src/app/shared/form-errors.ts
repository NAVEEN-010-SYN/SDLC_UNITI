import { AbstractControl, FormGroup } from '@angular/forms';
import { ApiProblem } from '../core/http/api-problem';

/**
 * Pushes server-side field errors (e.g. "body.email") onto matching form controls as
 * `{ server: { message } }`. Returns the errors that matched no control so the caller can
 * show them in a summary instead of losing them.
 */
export function applyProblemToForm(form: FormGroup, problem: ApiProblem): string[] {
  const unmatched: string[] = [];
  for (const { field, message } of problem.fieldErrors) {
    const path = field.replace(/^(body|query|params)\./, '');
    const control: AbstractControl | null = form.get(path);
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: { message } });
      control.markAsTouched();
    } else {
      unmatched.push(`${path}: ${message}`);
    }
  }
  return unmatched;
}

/** Marks every control touched so validation messages appear when a user submits early. */
export function revealErrors(form: AbstractControl): void {
  form.markAllAsTouched();
  form.updateValueAndValidity();
}

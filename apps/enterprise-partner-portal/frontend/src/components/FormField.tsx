import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ProblemError } from '../api/problem';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small id={`${id}-error`} className="field__error">{error}</small>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, ...input }: InputProps) {
  return <FieldShell label={label} error={error} hint={hint}>{(a11y) => <input {...input} {...a11y} />}</FieldShell>;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, error, options, placeholder, ...select }: SelectProps) {
  return (
    <FieldShell label={label} error={error}>
      {(a11y) => (
        <select {...select} {...a11y}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}

/** Field-level messages from a 400 problem response, keyed by request field name. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ProblemError ? error.fieldErrors : {};
}

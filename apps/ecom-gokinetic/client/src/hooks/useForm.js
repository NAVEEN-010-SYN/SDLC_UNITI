import { useCallback, useState } from 'react';
import { validateValues } from '../lib/validation';

function setPath(obj, path, value) {
  const keys = path.split('.');
  const copy = { ...obj };
  let node = copy;
  keys.slice(0, -1).forEach((key) => {
    node[key] = { ...(node[key] || {}) };
    node = node[key];
  });
  node[keys[keys.length - 1]] = value;
  return copy;
}

function getPath(obj, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

/**
 * Controlled form state with schema validation.
 *
 * - errors appear for a field once it has been touched or a submit was tried
 * - `handleSubmit` validates everything, then calls `onSubmit(values)`; if it
 *   throws an ApiError with field errors those are shown next to the fields
 *
 * @param {object} initialValues
 * @param {Record<string, Function[]>} schema see lib/validation
 */
export function useForm(initialValues, schema = {}) {
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const clientErrors = validateValues(schema, values);
  const errors = { ...clientErrors, ...serverErrors };
  const visibleError = (name) => (submitted || touched[name] ? errors[name] : undefined);

  const setValue = useCallback((name, value) => {
    setValues((v) => setPath(v, name, value));
    setServerErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _removed, ...rest } = e;
      return rest;
    });
  }, []);

  const field = (name, { type = 'text' } = {}) => ({
    name,
    id: `field-${name.replace(/\./g, '-')}`,
    ...(type === 'checkbox' ? { checked: Boolean(getPath(values, name)) } : { value: getPath(values, name) ?? '' }),
    onChange: (e) => setValue(name, type === 'checkbox' ? e.target.checked : e.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    'aria-invalid': visibleError(name) ? 'true' : undefined,
    error: visibleError(name),
  });

  const handleSubmit = (onSubmit) => async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(validateValues(schema, values)).length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err && Array.isArray(err.errors) && err.errors.length) {
        setServerErrors(Object.fromEntries(err.errors.map((e) => [e.path.replace(/^body\./, ''), e.message])));
      }
      setFormError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = (next = initialValues) => {
    setValues(next);
    setTouched({});
    setServerErrors({});
    setSubmitted(false);
    setFormError(null);
  };

  return {
    values,
    errors,
    isValid: Object.keys(clientErrors).length === 0,
    field,
    setValue,
    handleSubmit,
    submitting,
    formError,
    reset,
  };
}

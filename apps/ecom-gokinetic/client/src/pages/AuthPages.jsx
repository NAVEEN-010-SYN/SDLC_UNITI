import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useForm } from '../hooks/useForm';
import { normalizePhone, rules } from '../lib/validation';
import { Button, Field, ProblemAlert } from '../components/ui';

function useReturnTo(fallback = '/account') {
  const location = useLocation();
  return (location.state && location.state.from) || fallback;
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const form = useForm({ email: '', password: '' }, { email: [rules.email()], password: [rules.required('Password')] });

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const submit = form.handleSubmit(async (values) => {
    await login({ email: values.email.trim(), password: values.password });
    navigate(returnTo, { replace: true });
  });

  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>Sign in</h1>
      <Field label="Email" type="email" autoComplete="username" {...form.field('email')} />
      <Field label="Password" type="password" autoComplete="current-password" {...form.field('password')} />
      <ProblemAlert error={form.formError && form.formError.code !== 'ACCOUNT_LOCKED' ? form.formError : null} />
      {form.formError && form.formError.code === 'ACCOUNT_LOCKED' && (
        <p className="alert alert--error" role="alert">
          Too many attempts. Your login is locked until{' '}
          {new Date(form.formError.extensions.lockedUntil).toLocaleTimeString()}.
        </p>
      )}
      <Button type="submit" pending={form.submitting}>Sign in</Button>
      <p>
        New to GoKinetic? <Link to="/register" state={{ from: returnTo }}>Create an account</Link>
      </p>
    </form>
  );
}

const registerSchema = (isBusiness) => ({
  firstName: [rules.required('First name')],
  lastName: [rules.required('Last name')],
  email: [rules.email()],
  phone: [rules.phone()],
  password: [rules.password()],
  confirmPassword: [rules.matches('password', 'Passwords do not match.')],
  ...(isBusiness ? { businessName: [rules.required('Business name'), rules.minLength(2, 'Business name')] } : {}),
});

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = useReturnTo('/plans');
  const isBusiness = params.get('segment') === 'BUSINESS';
  const form = useForm(
    { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', businessName: '', marketingOptIn: false },
    registerSchema(isBusiness),
  );

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const submit = form.handleSubmit(async ({ confirmPassword, businessName, phone, ...values }) => {
    await register({
      ...values,
      email: values.email.trim(),
      phone: normalizePhone(phone),
      segment: isBusiness ? 'BUSINESS' : 'CONSUMER',
      ...(isBusiness ? { businessName: businessName.trim() } : {}),
    });
    navigate(returnTo, { replace: true });
  });

  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>{isBusiness ? 'Create a Business GoKinetic account' : 'Create your account'}</h1>
      {isBusiness && <Field label="Business name" autoComplete="organization" {...form.field('businessName')} />}
      <div className="grid-2">
        <Field label="First name" autoComplete="given-name" {...form.field('firstName')} />
        <Field label="Last name" autoComplete="family-name" {...form.field('lastName')} />
      </div>
      <Field label="Email" type="email" autoComplete="email" {...form.field('email')} />
      <Field label="Mobile phone" type="tel" autoComplete="tel" {...form.field('phone')} />
      <Field label="Password" type="password" autoComplete="new-password" hint="At least 10 characters with upper and lower case and a digit." {...form.field('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" {...form.field('confirmPassword')} />
      <Field type="checkbox" label="Send me offers and service news" {...form.field('marketingOptIn', { type: 'checkbox' })} />
      <ProblemAlert error={form.formError} />
      <Button type="submit" pending={form.submitting}>Create account</Button>
      <p>
        {isBusiness ? <Link to="/register">Signing up for home broadband?</Link> : <Link to="/register?segment=BUSINESS">Signing up a business?</Link>}
      </p>
    </form>
  );
}

/** Invited Business GoKinetic colleagues set their password here. */
export function ActivatePage() {
  const { endpoints } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const form = useForm(
    { password: '', confirmPassword: '' },
    { password: [rules.password()], confirmPassword: [rules.matches('password', 'Passwords do not match.')] },
  );

  const submit = form.handleSubmit(async ({ password }) => {
    await endpoints.auth.activate({ token, password });
    navigate('/login', { replace: true, state: { from: '/business/quotes' } });
  });

  if (!token) return <p className="alert alert--error">This invitation link is incomplete. Ask your administrator to resend it.</p>;
  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>Activate your login</h1>
      <Field label="Choose a password" type="password" autoComplete="new-password" {...form.field('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" {...form.field('confirmPassword')} />
      <ProblemAlert error={form.formError} />
      <Button type="submit" pending={form.submitting}>Activate</Button>
    </form>
  );
}

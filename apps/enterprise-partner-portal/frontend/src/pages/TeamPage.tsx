import { useState, type FormEvent } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { PartnerUser, PartnerUserRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { fieldErrorsOf, SelectField, TextField } from '../components/FormField';
import { PaginatedTable, type Column } from '../components/PaginatedTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAsync, useMutation } from '../hooks/useAsync';
import { usePageParams } from '../hooks/usePageParams';
import { formatDate, formatDateTime, humanise } from '../lib/format';

const ROLES: PartnerUserRole[] = ['PARTNER_AGENT', 'PARTNER_ADMIN'];
const roleOptions = ROLES.map((r) => ({ value: r, label: humanise(r.replace('PARTNER_', '')) }));

export function TeamPage() {
  const api = useEndpoints();
  const { user } = useAuth();
  const partnerId = user?.partnerId;
  const { page, pageSize, setPage } = usePageParams([] as const);
  const users = useAsync(() => (partnerId ? api.users.list(partnerId, { page, pageSize }) : Promise.resolve(undefined)),
    [api, partnerId, page, pageSize]);
  const seats = useAsync(() => (partnerId ? api.users.seats(partnerId) : Promise.resolve(undefined)), [api, partnerId]);
  const invite = useMutation((body: Parameters<typeof api.users.invite>[1]) => api.users.invite(partnerId!, body));
  const change = useMutation((action: () => Promise<PartnerUser>) => action());

  if (!partnerId) {
    return <section className="panel"><p>Team management is only available to partner users.</p></section>;
  }
  const refresh = () => { users.reload(); seats.reload(); };
  const inviteErrors = fieldErrorsOf(invite.error);

  async function submitInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const created = await invite.run({
      email: String(form.get('email')).trim(),
      firstName: String(form.get('firstName')).trim(),
      lastName: String(form.get('lastName')).trim(),
      role: form.get('role') as PartnerUserRole,
    });
    if (created) {
      formEl.reset();
      refresh();
    }
  }

  async function apply(action: () => Promise<PartnerUser>) {
    if (await change.run(action)) {
      refresh();
    }
  }

  const isSelf = (u: PartnerUser) => u.email.toLowerCase() === user?.email?.toLowerCase();
  const columns: Column<PartnerUser>[] = [
    { header: 'Name', render: (u) => `${u.firstName} ${u.lastName}` },
    { header: 'Email', render: (u) => u.email },
    {
      header: 'Role',
      render: (u) => (u.status === 'DEACTIVATED' || isSelf(u) ? humanise(u.role.replace('PARTNER_', '')) : (
        <select aria-label={`Role for ${u.email}`} value={u.role} disabled={change.pending}
          onChange={(e) => apply(() => api.users.update(partnerId, u, e.target.value as PartnerUserRole))}>
          {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )),
    },
    { header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { header: 'Certified', render: (u) => (u.certified ? `Until ${formatDate(u.certifiedUntil)}` : 'No') },
    { header: 'Last sign-in', render: (u) => formatDateTime(u.lastLoginAt) },
    {
      header: '',
      render: (u) => (
        <span className="toolbar" style={{ margin: 0 }}>
          {u.status === 'INVITED' && (
            <button type="button" disabled={change.pending}
              onClick={() => apply(() => api.users.resendInvite(partnerId, u.id))}>Resend invite</button>
          )}
          {u.status !== 'DEACTIVATED' && !isSelf(u) && (
            <button type="button" disabled={change.pending} onClick={() => {
              if (window.confirm(`Remove access for ${u.email}? Their seat will be released.`)) {
                void apply(() => api.users.deactivate(partnerId, u.id));
              }
            }}>Deactivate</button>
          )}
        </span>
      ),
    },
  ];

  const seat = seats.data;
  return (
    <>
      <h1>Team</h1>
      {seat && (
        <p aria-label="Seat usage">
          {seat.seatsUsed} of {seat.seatLimit} seats used
          {seat.seatsAvailable === 0 && ' \u2014 deactivate a user or progress to a higher tier to add more.'}
        </p>
      )}
      <form className="panel" onSubmit={submitInvite} aria-label="Invite user">
        <h2>Invite a colleague</h2>
        {invite.error && !Object.keys(inviteErrors).length ? <ErrorBanner error={invite.error} /> : null}
        <div className="grid">
          <TextField label="Email" name="email" type="email" required error={inviteErrors.email} />
          <TextField label="First name" name="firstName" required maxLength={80} error={inviteErrors.firstName} />
          <TextField label="Last name" name="lastName" required maxLength={80} error={inviteErrors.lastName} />
          <SelectField label="Role" name="role" options={roleOptions} defaultValue="PARTNER_AGENT" />
        </div>
        <button className="primary" type="submit" disabled={invite.pending || seat?.seatsAvailable === 0}>Send invite</button>
      </form>
      <ErrorBanner error={change.error} />
      <PaginatedTable columns={columns} page={users.data} loading={users.loading} error={users.error}
        rowKey={(u) => u.id} onPageChange={setPage} />
    </>
  );
}

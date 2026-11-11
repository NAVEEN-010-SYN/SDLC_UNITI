import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ChangeRequestView } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canApprove, SessionUser } from '../auth/token';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatDateTime, humanize } from '../lib/format';

/** Mirrors api/src/domain/approvalRules.checkCanDecide for button state; the API remains the authority. */
export function decisionBlocker(cr: ChangeRequestView, user: SessionUser | null): string | null {
  if (cr.status !== 'SUBMITTED') return null;
  if (!canApprove(user)) return 'Only business administrators can approve changes';
  if (user!.userId === cr.requestedBy) return 'You cannot approve a change you requested';
  if (cr.approvals.some((a) => a.userId === user!.userId)) return 'You have already recorded a decision';
  return null;
}

function DecisionForm({ onDecide, pending }: { onDecide: (d: 'APPROVE' | 'REJECT', comment?: string) => void; pending: boolean }) {
  const [comment, setComment] = useState('');
  const rejectable = comment.trim().length >= 5;
  return (
    <div className="decision">
      <label>
        Comment
        <textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Required when rejecting (5+ characters)" />
      </label>
      <button type="button" disabled={pending} onClick={() => onDecide('APPROVE', comment.trim() || undefined)}>
        Approve
      </button>
      <button type="button" disabled={pending || !rejectable} onClick={() => onDecide('REJECT', comment.trim())}>
        Reject
      </button>
    </div>
  );
}

function ScheduleForm({ cr, onSchedule, pending }: { cr: ChangeRequestView; onSchedule: (at: string, windowId?: string) => void; pending: boolean }) {
  const api = useApi();
  const windows = useAsync((s) => api.upcomingWindows(14, s), [api]);
  const [custom, setCustom] = useState('');
  const needsWindow = cr.approvalPolicy.requiresMaintenanceWindow;
  return (
    <div className="schedule">
      <h3>Schedule</h3>
      <ProblemBanner error={windows.error} />
      {windows.data?.length === 0 && needsWindow && <p className="field-error">No maintenance windows open in the next 14 days. Ask an administrator to create one.</p>}
      <ul>
        {windows.data?.map((w) => (
          <li key={`${w.windowId}-${w.start}`}>
            {w.name}: {formatDateTime(w.start)} &ndash; {formatDateTime(w.end)}{' '}
            <button type="button" disabled={pending} onClick={() => onSchedule(new Date(Math.max(Date.parse(w.start), Date.now() + 60_000)).toISOString(), w.windowId)}>
              Use this window
            </button>
          </li>
        ))}
      </ul>
      {!needsWindow && (
        <label>
          Or a specific time (UTC)
          <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button type="button" disabled={pending || !custom} onClick={() => onSchedule(new Date(`${custom}:00Z`).toISOString())}>
            Schedule
          </button>
        </label>
      )}
    </div>
  );
}

export function ChangeRequestDetailPage() {
  const { changeId = '' } = useParams();
  const api = useApi();
  const { user } = useAuth();
  const cr = useAsync((s) => api.change(changeId, s), [api, changeId]);
  const action = useMutation(async (fn: () => Promise<ChangeRequestView>) => {
    const updated = await fn();
    cr.setData(() => updated);
    return updated;
  });

  if (cr.error) return <ProblemBanner error={cr.error} onRetry={cr.reload} />;
  const c = cr.data;
  if (!c) return <p aria-busy="true">Loading change request&hellip;</p>;

  const isOwner = user?.userId === c.requestedBy;
  const blocker = decisionBlocker(c, user);
  const canAct = isOwner || canApprove(user);

  return (
    <section>
      <h1>
        {c.title} <StatusPill value={c.status} />
      </h1>
      <p className="meta">
        {humanize(c.type)} on {c.edgeIds.length} edge(s) &middot; requested by {c.requestedBy} on {formatDateTime(c.createdAt)}
        {c.emergency && ' \u00B7 emergency'}
      </p>
      {c.description && <p>{c.description}</p>}

      <h2>
        Risk <StatusPill value={c.risk} />
      </h2>
      <ul>
        {c.riskReasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {c.lintFindings && c.lintFindings.length > 0 && (
        <>
          <h3>Rule analysis</h3>
          <ul className="findings">
            {c.lintFindings.map((f) => (
              <li key={`${f.ruleId}-${f.message}`}>
                <StatusPill value={f.severity === 'WARNING' ? 'DEGRADED' : 'STANDBY'} label={humanize(f.severity)} /> {f.message}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Approvals</h2>
      <p>
        Needs {c.approvalPolicy.requiredApprovals} approval(s)
        {c.approvalPolicy.requiredRoles.length > 0 && `, including ${c.approvalPolicy.requiredRoles.map(humanize).join(' and ')}`}
        {c.approvalPolicy.requiresMaintenanceWindow && '; must run in a maintenance window'}.
      </p>
      {c.outstanding.length > 0 && <p className="notice">Still required: {c.outstanding.join(', ')}</p>}
      <ul>
        {c.approvals.map((a) => (
          <li key={a.userId}>
            <StatusPill value={a.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'} /> {a.userId} ({humanize(a.role)}) {formatDateTime(a.decidedAt)}
            {a.comment && <q>{a.comment}</q>}
          </li>
        ))}
      </ul>

      <ProblemBanner error={action.error} />
      {c.status === 'SUBMITTED' &&
        (blocker ? <p className="meta">{blocker}</p> : <DecisionForm pending={action.pending} onDecide={(d, comment) => action.run(() => api.decideChange(c.id, d, comment))} />)}
      {c.status === 'DRAFT' && isOwner && (
        <button type="button" disabled={action.pending} onClick={() => action.run(() => api.submitChange(c.id))}>
          Submit for approval
        </button>
      )}
      {c.status === 'APPROVED' && canAct && !c.emergency && (
        <ScheduleForm cr={c} pending={action.pending} onSchedule={(at, w) => action.run(() => api.scheduleChange(c.id, at, w))} />
      )}
      {['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED'].includes(c.status) && canAct && (
        <button type="button" className="secondary" disabled={action.pending} onClick={() => action.run(() => api.cancelChange(c.id))}>
          Cancel change
        </button>
      )}

      {c.results.length > 0 && (
        <>
          <h2>Execution</h2>
          <ul>
            {c.results.map((r) => (
              <li key={r.edgeId}>
                <StatusPill value={r.ok ? 'COMPLETED' : 'FAILED'} /> {r.edgeId} {r.error && `\u2014 ${r.error}`}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>History</h2>
      <ol className="timeline">
        {c.history.map((h) => (
          <li key={`${h.at}-${h.to}`}>
            <time dateTime={h.at}>{formatDateTime(h.at)}</time> {h.from ? `${humanize(h.from)} \u2192 ` : ''}
            {humanize(h.to)} by {h.by}
            {h.note && ` \u2014 ${h.note}`}
          </li>
        ))}
      </ol>
    </section>
  );
}

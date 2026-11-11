import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PolicyPreviewResult } from '../api/sdwan';
import type { BusinessPolicy } from '../api/types';
import { useApi, useAuth } from '../auth/AuthContext';
import { canRequestChanges } from '../auth/token';
import { EdgePicker } from '../components/EdgePicker';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { formatCidrs, formatPorts } from '../lib/firewallDraft';
import { humanize } from '../lib/format';
import { describeChanges, hasChanges, movePolicy, removePolicy, summarizePolicyChanges, togglePolicy } from '../lib/policyDraft';

function describeMatch(p: BusinessPolicy): string {
  const m = p.match;
  const parts = [
    m.applications?.length ? m.applications.join(', ') : null,
    m.sourceCidrs?.length ? `from ${formatCidrs(m.sourceCidrs)}` : null,
    m.destinationCidrs?.length ? `to ${formatCidrs(m.destinationCidrs)}` : null,
    m.protocol && m.protocol !== 'ANY' ? `${m.protocol}${m.destinationPorts?.length ? `/${formatPorts(m.destinationPorts)}` : ''}` : null,
    m.dscp !== undefined ? `DSCP ${m.dscp}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' \u00B7 ') : 'all traffic';
}

function describeSteering(p: BusinessPolicy): string {
  const a = p.action;
  const base = humanize(a.steering);
  return a.preferredTransport ? `${base} (${a.preferredTransport.toLowerCase()})` : base;
}

export function PoliciesPage() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [edgeId, setEdgeId] = useState<string>();
  const current = useAsync((s) => (edgeId ? api.policies(edgeId, s) : Promise.resolve(undefined)), [api, edgeId]);
  const [draft, setDraft] = useState<BusinessPolicy[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => setDraft(current.data?.policies ?? []), [current.data]);

  const summary = useMemo(() => summarizePolicyChanges(current.data?.policies ?? [], draft), [current.data, draft]);
  const dirty = hasChanges(summary);
  const preview = useMutation(() => api.previewPolicies([edgeId!], draft));
  const [previewResult, setPreviewResult] = useState<PolicyPreviewResult>();
  useEffect(() => setPreviewResult(undefined), [draft]);
  const submit = useMutation(() =>
    api.createChange({
      title: title.trim() || `Business policies: ${describeChanges(summary)}`.slice(0, 120),
      edgeIds: [edgeId!],
      payload: { type: 'POLICY_UPDATE', policies: draft },
      submit: true,
    }),
  );
  const editable = canRequestChanges(user);

  return (
    <section>
      <h1>Business policies</h1>
      <p className="meta">Policies are evaluated top to bottom; the first match decides service class and how traffic is steered across WAN links.</p>
      <EdgePicker value={edgeId} onChange={setEdgeId} />
      <ProblemBanner error={current.error} onRetry={current.reload} />

      {current.data?.warnings.map((w) => (
        <p key={`${w.policyId}-${w.field}`} className="notice">
          {w.message}
        </p>
      ))}

      {current.data && (
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Policy</th>
              <th scope="col">Matches</th>
              <th scope="col">Class / priority</th>
              <th scope="col">Steering</th>
              <th scope="col">State</th>
              {editable && <th scope="col">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No business policies; all traffic uses default best-path steering.
                </td>
              </tr>
            )}
            {draft.map((p, i) => (
              <tr key={p.id} className={p.enabled ? undefined : 'disabled'}>
                <td>{p.order}</td>
                <td>{p.name}</td>
                <td>{describeMatch(p)}</td>
                <td>
                  {humanize(p.action.serviceClass)} / {humanize(p.action.priority)}
                </td>
                <td>{describeSteering(p)}</td>
                <td>
                  <StatusPill value={p.enabled ? 'UP' : 'STANDBY'} label={p.enabled ? 'Enabled' : 'Disabled'} />
                </td>
                {editable && (
                  <td className="row-actions">
                    <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => setDraft(movePolicy(draft, i, -1))}>
                      &uarr;
                    </button>
                    <button type="button" aria-label={`Move ${p.name} down`} disabled={i === draft.length - 1} onClick={() => setDraft(movePolicy(draft, i, 1))}>
                      &darr;
                    </button>
                    <button type="button" onClick={() => setDraft(togglePolicy(draft, p.id))}>
                      {p.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" onClick={() => setDraft(removePolicy(draft, p.id))}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && dirty && (
        <div className="draft-bar">
          <p>
            Pending: <strong>{describeChanges(summary)}</strong>
          </p>
          <label>
            Change title
            <input value={title} maxLength={120} placeholder={`Business policies: ${describeChanges(summary)}`} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="button" onClick={async () => setPreviewResult(await preview.run())} disabled={preview.pending}>
            Validate
          </button>
          <button
            type="button"
            disabled={submit.pending || previewResult?.valid === false}
            onClick={async () => {
              const cr = await submit.run();
              if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
            }}
          >
            Submit for approval
          </button>
          <button type="button" onClick={() => setDraft(current.data?.policies ?? [])}>
            Discard
          </button>
          {previewResult && (
            <ul className="findings" aria-label="Validation results">
              {previewResult.valid && previewResult.issues.length + previewResult.warnings.length === 0 && <li>No issues found.</li>}
              {previewResult.issues.map((i) => (
                <li key={`${i.policyId}-${i.message}`}>
                  <StatusPill value={i.severity === 'ERROR' ? 'FAILED' : 'DEGRADED'} label={humanize(i.severity)} /> {i.message}
                </li>
              ))}
              {previewResult.warnings.map((w) => (
                <li key={`${w.vendor}-${w.policyId}-${w.message}`}>
                  <StatusPill value="DEGRADED" label={w.vendor === 'FORTINET' ? 'Fortinet' : 'VeloCloud'} /> {w.message}
                </li>
              ))}
            </ul>
          )}
          <ProblemBanner error={preview.error ?? submit.error} />
        </div>
      )}
    </section>
  );
}

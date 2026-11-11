import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Finding, FirewallRule } from '../api/types';
import { RequireRole, useApi } from '../auth/AuthContext';
import { EdgePicker } from '../components/EdgePicker';
import { ProblemBanner } from '../components/ProblemBanner';
import { StatusPill } from '../components/StatusPill';
import { useAsync, useMutation } from '../hooks/useAsync';
import { buildRule, EMPTY_RULE_FORM, FirewallRuleForm, formatCidrs, formatPorts, FormErrors } from '../lib/firewallDraft';
import { humanize } from '../lib/format';

function RuleForm({ existing, onAdd }: { existing: FirewallRule[]; onAdd: (r: FirewallRule) => void }) {
  const [form, setForm] = useState<FirewallRuleForm>(EMPTY_RULE_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const set = <K extends keyof FirewallRuleForm>(k: K, v: FirewallRuleForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const { rule, errors: errs } = buildRule(form, existing, `new-${crypto.randomUUID().slice(0, 8)}`);
    setErrors(errs);
    if (rule) {
      onAdd(rule);
      setForm(EMPTY_RULE_FORM);
    }
  };

  const field = (k: 'name' | 'sources' | 'destinations' | 'ports', label: string, placeholder: string) => (
    <label>
      {label}
      <input value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `err-${k}` : undefined} />
      {errors[k] && (
        <span id={`err-${k}`} className="field-error">
          {errors[k]}
        </span>
      )}
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="rule-form" aria-label="Add firewall rule">
      {field('name', 'Name', 'Allow-HTTPS-out')}
      <label>
        Action
        <select value={form.action} onChange={(e) => set('action', e.target.value as FirewallRuleForm['action'])}>
          <option value="ALLOW">Allow</option>
          <option value="DENY">Deny</option>
        </select>
      </label>
      <label>
        Protocol
        <select value={form.protocol} onChange={(e) => set('protocol', e.target.value as FirewallRuleForm['protocol'])}>
          {(['TCP', 'UDP', 'ICMP', 'ANY'] as const).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {field('sources', 'Source', '10.0.0.0/24 or any')}
      {field('destinations', 'Destination', '0.0.0.0/0 or any')}
      {field('ports', 'Ports', '443, 8000-8080 or any')}
      <label className="inline">
        <input type="checkbox" checked={form.log} onChange={(e) => set('log', e.target.checked)} /> Log matches
      </label>
      <button type="submit">Add rule</button>
    </form>
  );
}

/** Fortinet edges only: VeloCloud firewall is managed by Uniti through the orchestrator profile. */
export function FirewallPage() {
  const api = useApi();
  const navigate = useNavigate();
  const [edgeId, setEdgeId] = useState<string>();
  const current = useAsync((s) => (edgeId ? api.firewall(edgeId, s) : Promise.resolve(undefined)), [api, edgeId]);
  const [draft, setDraft] = useState<FirewallRule[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  useEffect(() => {
    setDraft(current.data?.rules ?? []);
    setFindings(current.data?.findings ?? []);
  }, [current.data]);

  const ordered = useMemo(() => [...draft].sort((a, b) => a.sequence - b.sequence), [draft]);
  const dirty = JSON.stringify(ordered) !== JSON.stringify(current.data?.rules ?? []);
  const lint = useMutation((rules: FirewallRule[]) => api.previewFirewall(rules));
  const submit = useMutation(() =>
    api.createChange({ title: `Firewall update (${ordered.length} rules)`, edgeIds: [edgeId!], payload: { type: 'FIREWALL_UPDATE', rules: ordered }, submit: true }),
  );
  const blocking = findings.some((f) => f.severity === 'ERROR');
  const findingsByRule = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) if (f.ruleId) m.set(f.ruleId, [...(m.get(f.ruleId) ?? []), f]);
    return m;
  }, [findings]);

  const updateDraft = async (next: FirewallRule[]) => {
    setDraft(next);
    const res = await lint.run(next);
    if (res) setFindings(res.findings);
  };

  return (
    <section>
      <h1>Firewall rules</h1>
      <EdgePicker value={edgeId} onChange={setEdgeId} vendor="FORTINET" label="FortiGate" />
      <ProblemBanner error={current.error} onRetry={current.reload} />
      {current.data && (
        <table>
          <thead>
            <tr>
              <th scope="col">Seq</th>
              <th scope="col">Name</th>
              <th scope="col">Action</th>
              <th scope="col">Protocol</th>
              <th scope="col">Source</th>
              <th scope="col">Destination</th>
              <th scope="col">Ports</th>
              <th scope="col">Findings</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr key={r.id} className={r.enabled ? undefined : 'disabled'}>
                <td>{r.sequence}</td>
                <td>{r.name}</td>
                <td>
                  <StatusPill value={r.action === 'ALLOW' ? 'UP' : 'DOWN'} label={humanize(r.action)} />
                </td>
                <td>{r.protocol}</td>
                <td>{formatCidrs(r.sourceCidrs)}</td>
                <td>{formatCidrs(r.destinationCidrs)}</td>
                <td>{r.protocol === 'ICMP' ? '—' : formatPorts(r.destinationPorts)}</td>
                <td>
                  {(findingsByRule.get(r.id) ?? []).map((f) => (
                    <div key={`${f.code}-${f.message}`} title={f.message}>
                      <StatusPill value={f.severity === 'ERROR' ? 'FAILED' : f.severity === 'WARNING' ? 'DEGRADED' : 'STANDBY'} label={humanize(f.code ?? f.severity)} />
                    </div>
                  ))}
                </td>
                <td>
                  <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
                    <button type="button" onClick={() => updateDraft(draft.filter((x) => x.id !== r.id))}>
                      Remove
                    </button>
                  </RequireRole>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {findings.length > 0 && (
        <ul className="findings" aria-label="Rule analysis">
          {findings.map((f) => (
            <li key={`${f.ruleId}-${f.code}-${f.message}`}>{f.message}</li>
          ))}
        </ul>
      )}
      <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT']}>
        {current.data && <RuleForm existing={draft} onAdd={(r) => updateDraft([...draft, r])} />}
        {dirty && (
          <div className="draft-bar">
            {blocking && <p className="field-error">Resolve the errors above before submitting.</p>}
            <button
              type="button"
              disabled={blocking || lint.pending || submit.pending}
              onClick={async () => {
                const cr = await submit.run();
                if (cr) navigate(`/changes/${encodeURIComponent(cr.id)}`);
              }}
            >
              Submit for approval
            </button>
            <button type="button" onClick={() => updateDraft(current.data?.rules ?? [])}>
              Discard
            </button>
          </div>
        )}
        <ProblemBanner error={lint.error ?? submit.error} />
      </RequireRole>
    </section>
  );
}

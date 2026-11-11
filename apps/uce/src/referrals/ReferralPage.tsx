import { useEffect, useMemo, useRef, useState } from 'react';
import { userMessage } from '../api/problem';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { useConsent } from '../consent/ConsentProvider';
import { formatDate, formatMoney } from '../lib/money';
import {
  buildShareLinks,
  countInProgress,
  Referral,
  REFERRAL_STATUS_LABELS,
  ReferralService,
  Reward,
  summariseRewards,
} from './referralService';

interface ReferralPageProps {
  service: ReferralService;
  shareBaseUrl: string;
}

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

export function ReferralPage({ service, shareBaseUrl }: ReferralPageProps) {
  const consent = useConsent();
  const analytics = useAnalytics();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState<string>();
  const [widgetError, setWidgetError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<Load<{ rewards: Reward[]; referrals: Referral[] }>>({ state: 'loading' });
  const widgetAllowed = consent.isGranted('functional') && service.widgetAvailable;

  useEffect(() => {
    let cancelled = false;
    Promise.all([service.listRewards(), service.listReferrals(), service.getToken()])
      .then(([rewards, referrals, token]) => {
        if (cancelled) return;
        setHistory({ state: 'ready', data: { rewards: rewards.items, referrals: referrals.items } });
        setCode((current) => current ?? token.referralCode);
      })
      .catch((error) => !cancelled && setHistory({ state: 'error', message: userMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [service]);

  useEffect(() => {
    if (!widgetAllowed || !widgetRef.current) return;
    service
      .mountWidget(widgetRef.current)
      .then((result) => setCode(result.referralCode))
      .catch(() => setWidgetError('The referral widget could not be loaded. You can still share your code below.'));
  }, [service, widgetAllowed]);

  const links = useMemo(() => (code ? buildShareLinks(code, shareBaseUrl) : undefined), [code, shareBaseUrl]);

  const copy = async () => {
    if (!links) return;
    await navigator.clipboard.writeText(links.url);
    setCopied(true);
    analytics.track('referral_link_copied', { channel: 'copy' });
  };

  return (
    <main className="uce-referrals" aria-labelledby="referrals-title">
      <h1 id="referrals-title">Refer a friend</h1>

      <section aria-label="Share your code">
        {code ? (
          <>
            <p>
              Your referral code: <strong data-testid="referral-code">{code}</strong>
            </p>
            <button type="button" onClick={copy}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
            <a href={links!.email} onClick={() => analytics.track('referral_shared', { channel: 'email' })}>
              Email
            </a>
            <a href={links!.whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track('referral_shared', { channel: 'whatsapp' })}>
              WhatsApp
            </a>
          </>
        ) : (
          history.state === 'loading' && <p role="status">Loading your referral code...</p>
        )}
      </section>

      {service.widgetAvailable && !consent.isGranted('functional') && (
        <p className="uce-notice">
          The interactive referral widget needs functional cookies.{' '}
          <button type="button" onClick={consent.openPreferences}>
            Cookie settings
          </button>
        </p>
      )}
      {widgetError && <p role="alert">{widgetError}</p>}
      {widgetAllowed && <div ref={widgetRef} className="uce-referrals__widget" data-testid="squatch-container" />}

      {history.state === 'error' && <p role="alert">{history.message}</p>}
      {history.state === 'ready' && <ReferralHistory rewards={history.data.rewards} referrals={history.data.referrals} />}
    </main>
  );
}

function ReferralHistory({ rewards, referrals }: { rewards: Reward[]; referrals: Referral[] }) {
  const summary = summariseRewards(rewards);
  return (
    <>
      <section aria-labelledby="rewards-title">
        <h2 id="rewards-title">Your rewards</h2>
        <p>
          Available: {summary.available.length ? summary.available.map((m) => formatMoney(m)).join(' + ') : formatMoney({ amountMinor: 0, currency: 'GBP' })}
          {summary.pendingCount > 0 && ` - ${summary.pendingCount} pending`}
        </p>
        {rewards.length === 0 ? (
          <p>No rewards yet. You'll earn one when a friend's service is installed.</p>
        ) : (
          <ul>
            {rewards.map((r) => (
              <li key={r.id}>
                {formatMoney(r.amount)} {r.type === 'ACCOUNT_CREDIT' ? 'bill credit' : 'gift card'} - {r.status.toLowerCase()} ({formatDate(r.earnedAt)})
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="status-title">
        <h2 id="status-title">Referral status ({countInProgress(referrals)} in progress)</h2>
        {referrals.length === 0 ? (
          <p>You haven't referred anyone yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Friend</th>
                <th scope="col">Status</th>
                <th scope="col">Since</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.refereeDisplayName}</td>
                  <td>{REFERRAL_STATUS_LABELS[r.status]}</td>
                  <td>{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

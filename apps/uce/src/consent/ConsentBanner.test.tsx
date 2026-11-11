import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { acceptAll } from './consentModel';
import { ConsentBanner } from './ConsentBanner';
import { CONSENT_STORAGE_KEY, ConsentProvider, useConsent } from './ConsentProvider';

const POLICY = '2026-11';
const clock = () => new Date('2026-11-11T10:00:00Z');

function GrantProbe() {
  const consent = useConsent();
  return <output data-testid="analytics">{String(consent.isGranted('analytics'))}</output>;
}

function renderBanner(onDecision = vi.fn(), gpc = false) {
  render(
    <ConsentProvider policyVersion={POLICY} onDecision={onDecision} storage={localStorage} clock={clock} gpc={gpc}>
      <ConsentBanner />
      <GrantProbe />
    </ConsentProvider>,
  );
  return onDecision;
}

describe('ConsentBanner', () => {
  it('shows accept and reject with equal prominence and grants nothing before a choice', () => {
    renderBanner();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject non-essential' })).toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('false');
  });

  it('records accept all, persists it, audits it and hides the banner', async () => {
    const onDecision = renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!).source).toBe('banner_accept_all');
    expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ policyVersion: POLICY }));
  });

  it('lets the visitor choose categories, with necessary locked on and nothing pre-ticked', async () => {
    renderBanner();
    await userEvent.click(screen.getByRole('button', { name: 'Manage preferences' }));
    const necessary = screen.getByRole('checkbox', { name: /Strictly necessary/ });
    expect(necessary).toBeChecked();
    expect(necessary).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Analytics/ })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Analytics/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored.choices).toEqual({ necessary: true, functional: false, analytics: true, marketing: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays hidden for a returning visitor with a current decision', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(acceptAll(POLICY, clock())));
    renderBanner();
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('true');
  });

  it('ignores corrupt stored consent and asks again', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, '{not-json');
    renderBanner();
    expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  });

  it('does not block the visitor when the audit call fails', async () => {
    renderBanner(vi.fn().mockRejectedValue(new Error('offline')));
    await userEvent.click(screen.getByRole('button', { name: 'Reject non-essential' }));
    expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics')).toHaveTextContent('false');
  });
});

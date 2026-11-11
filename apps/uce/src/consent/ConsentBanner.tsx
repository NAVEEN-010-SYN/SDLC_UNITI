import { FormEvent, useEffect, useState } from 'react';
import { CATEGORY_INFO, CONSENT_CATEGORIES, ConsentChoices, deniedChoices } from './consentModel';
import { useConsent } from './ConsentProvider';

/**
 * Cookie banner + preferences dialog. "Reject" is as prominent as "Accept"
 * (no dark patterns), and nothing optional is pre-ticked.
 */
export function ConsentBanner() {
  const consent = useConsent();
  const [choices, setChoices] = useState<ConsentChoices>(() => consent.record?.choices ?? deniedChoices());

  useEffect(() => {
    if (consent.preferencesOpen) setChoices(consent.record?.choices ?? deniedChoices());
  }, [consent.preferencesOpen, consent.record]);

  if (consent.preferencesOpen) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      consent.save(choices);
    };
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="consent-prefs-title" className="uce-consent uce-consent--dialog">
        <form onSubmit={submit}>
          <h2 id="consent-prefs-title">Cookie preferences</h2>
          {CONSENT_CATEGORIES.map((category) => (
            <label key={category} className="uce-consent__category">
              <input
                type="checkbox"
                name={category}
                checked={category === 'necessary' ? true : choices[category]}
                disabled={category === 'necessary'}
                onChange={(e) => setChoices((prev) => ({ ...prev, [category]: e.target.checked }))}
              />
              <span>
                <strong>{CATEGORY_INFO[category].label}</strong>
                <small>{CATEGORY_INFO[category].description}</small>
              </span>
            </label>
          ))}
          <div className="uce-consent__actions">
            <button type="submit">Save preferences</button>
            {!consent.needsDecision && (
              <button type="button" onClick={consent.closePreferences}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  if (!consent.needsDecision) return null;

  return (
    <section role="region" aria-label="Cookie consent" className="uce-consent">
      <p>
        We use strictly necessary cookies to run your account. With your permission we'd also like to use analytics and
        functional cookies to improve the service. You can change your mind at any time from "Cookie settings".
      </p>
      <div className="uce-consent__actions">
        <button type="button" onClick={consent.acceptAll}>
          Accept all
        </button>
        <button type="button" onClick={consent.rejectAll}>
          Reject non-essential
        </button>
        <button type="button" onClick={consent.openPreferences}>
          Manage preferences
        </button>
      </div>
    </section>
  );
}

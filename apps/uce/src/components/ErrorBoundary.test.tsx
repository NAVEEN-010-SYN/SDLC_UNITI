import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/problem';
import { ErrorBoundary } from './ErrorBoundary';

function Thrower({ error }: { error?: Error }) {
  if (error) throw error;
  return <p>Portal content</p>;
}

describe('ErrorBoundary', () => {
  it('contains a render failure and reports it without PII', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Thrower error={new TypeError('cannot read properties of undefined')} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/quote reference ui-[0-9a-f]{8}/);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'TypeError', reference: expect.stringMatching(/^ui-/) }));
  });

  it('uses the API correlation id as the support reference', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new ApiError({ type: 'about:blank', title: 'Service unavailable', status: 503 }, 'uce-corr-42');
    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('uce-corr-42');
  });

  it('recovers via "Try again" once the cause is gone, and on resetKey change', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Harness() {
      const [broken, setBroken] = useState(true);
      const [key, setKey] = useState('/a');
      return (
        <>
          <button onClick={() => setBroken(false)}>fix</button>
          <button onClick={() => setKey('/b')}>navigate</button>
          <button onClick={() => setBroken(true)}>break</button>
          <ErrorBoundary resetKey={key}>
            <Thrower error={broken ? new Error('boom') : undefined} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByText('fix'));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Portal content')).toBeInTheDocument();

    await userEvent.click(screen.getByText('break'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByText('fix'));
    await userEvent.click(screen.getByText('navigate'));
    expect(screen.getByText('Portal content')).toBeInTheDocument();
  });
});

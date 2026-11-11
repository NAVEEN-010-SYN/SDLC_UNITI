import { Component, ErrorInfo, ReactNode } from 'react';
import { ApiError } from '../api/problem';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called once per caught error, e.g. to log or track a non-PII "ui_error" event. */
  onError?: (report: { name: string; reference: string; componentStack?: string }) => void;
  /** Changing this value (e.g. the route path) clears the error. */
  resetKey?: unknown;
  fallback?: (props: { reference: string; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
  reference?: string;
}

/**
 * Contains render failures to the area that failed (a portal frame, a widget)
 * instead of blanking the shell. The reference shown to the customer is the
 * API correlation id when available, so support can find the matching logs.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const reference = error instanceof ApiError ? error.correlationId : `ui-${crypto.randomUUID().slice(0, 8)}`;
    return { error, reference };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const reference = this.state.reference ?? 'unknown';
    console.error(JSON.stringify({ level: 'error', message: 'ui render failure', name: error.name, reference }));
    this.props.onError?.({ name: error.name, reference, componentStack: info.componentStack ?? undefined });
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.reset();
  }

  reset = (): void => {
    this.setState({ error: undefined, reference: undefined });
  };

  render(): ReactNode {
    const { error, reference } = this.state;
    if (!error || !reference) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ reference, reset: this.reset });
    return (
      <section role="alert" className="uce-error">
        <h2>Something went wrong</h2>
        <p>This part of the page couldn't be displayed. If it keeps happening, contact support and quote reference {reference}.</p>
        <button type="button" onClick={this.reset}>
          Try again
        </button>
      </section>
    );
  }
}

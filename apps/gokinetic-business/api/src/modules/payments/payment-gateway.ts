import { AppError } from '../../lib/errors';
import { currentCorrelationId, logger } from '../../lib/logger';

export interface MandateRequest {
  accountId: string;
  holderName: string;
  sortCode: string;
  accountNumber: string;
}

export interface PaymentGateway {
  /** Creates a Direct Debit mandate; bank details are not retained by this service. */
  createMandate(request: MandateRequest): Promise<{ mandateRef: string }>;
  /** Confirms a card token issued by the provider's hosted fields belongs to us and is reusable. */
  verifyCardToken(token: string): Promise<{ reusableRef: string }>;
  revoke(providerRef: string): Promise<void>;
}

export class PaymentGatewayError extends AppError {
  constructor(detail: string, status = 502) {
    super(status, 'payment-gateway', 'Payment provider error', detail);
  }
}

export interface GatewaySettings {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/** REST adapter for the payment service provider; propagates the correlation id. */
export function createHttpPaymentGateway(settings: GatewaySettings, fetchImpl: typeof fetch = fetch): PaymentGateway {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const response = await fetchImpl(`${settings.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
          'X-Correlation-Id': currentCorrelationId() ?? ''
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (response.status === 422) {
        throw new PaymentGatewayError('The payment provider rejected these details', 422);
      }
      if (!response.ok) {
        logger.error('payment gateway call failed', { path, status: response.status });
        throw new PaymentGatewayError('The payment provider is unavailable; please try again later');
      }
      return (response.status === 204 ? undefined : await response.json()) as T;
    } catch (err) {
      if (err instanceof PaymentGatewayError) throw err;
      logger.error('payment gateway unreachable', { path, err });
      throw new PaymentGatewayError('The payment provider is unavailable; please try again later');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    createMandate: (req) => call<{ mandateRef: string }>('POST', '/v1/mandates', req),
    verifyCardToken: (token) => call<{ reusableRef: string }>('POST', '/v1/card-tokens/verify', { token }),
    revoke: async (ref) => {
      await call<void>('DELETE', `/v1/payment-instruments/${encodeURIComponent(ref)}`);
    }
  };
}

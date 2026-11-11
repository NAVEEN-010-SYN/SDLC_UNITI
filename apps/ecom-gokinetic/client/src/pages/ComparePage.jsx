import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useAvailability } from '../hooks/useAvailability';
import { formatMoney, formatSpeed } from '../lib/format';
import { ProblemAlert, Spinner, EmptyState } from '../components/ui';

/**
 * Side-by-side plan comparison. Rows are derived from the API's compare
 * endpoint, which also flags the cheapest and fastest plan.
 */
export function ComparePage() {
  const { endpoints } = useAuth();
  const [params] = useSearchParams();
  const skus = (params.get('skus') || '').split(',').filter(Boolean);
  const availability = useAvailability();
  const result = useAsync(() => endpoints.catalog.compare(skus.join(',')), [skus.join(',')], { enabled: skus.length >= 2 });

  if (skus.length < 2) {
    return (
      <EmptyState title="Pick plans to compare">
        <p>
          Select two to four plans on the <Link to="/plans">plans page</Link>.
        </p>
      </EmptyState>
    );
  }

  const plans = result.data ? result.data.items : [];
  const allFeatures = [...new Set(plans.flatMap((p) => p.features))];
  const rows = [
    ['Download', (p) => formatSpeed(p.speedMbps)],
    ['Upload', (p) => formatSpeed(p.uploadMbps)],
    ['Monthly price', (p) => formatMoney(p.monthlyPrice)],
    ['Installation', (p) => formatMoney(p.installationFee)],
    ['Price per 100 Mbps', (p) => formatMoney(p.centsPerMbps * 100)],
    ['At your address', (p) => (availability.check ? (availability.isAvailable(p.sku) ? 'Available' : 'Not available') : 'Check address')],
    ...allFeatures.map((feature) => [feature, (p) => (p.features.includes(feature) ? 'Included' : '-')]),
  ];

  return (
    <div className="page">
      <h1>Compare plans</h1>
      <ProblemAlert error={result.error} onRetry={result.reload} />
      {result.loading && <Spinner />}
      {plans.length > 0 && (
        <div className="table-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Feature</span>
                </th>
                {plans.map((p) => (
                  <th key={p.sku} scope="col">
                    {p.name}
                    {p.isCheapest && <span className="badge badge--success">Best price</span>}
                    {p.isFastest && <span className="badge badge--info">Fastest</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {plans.map((p) => (
                    <td key={p.sku}>{cell(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link to="/plans" className="btn btn--secondary">
        Back to plans
      </Link>
    </div>
  );
}

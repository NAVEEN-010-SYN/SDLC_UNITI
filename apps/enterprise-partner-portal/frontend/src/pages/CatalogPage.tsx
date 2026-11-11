import { useState } from 'react';
import { useEndpoints } from '../api/ApiContext';
import type { ProductCategory } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { SelectField } from '../components/FormField';
import { Money } from '../components/Money';
import { useAsync } from '../hooks/useAsync';
import { humanise } from '../lib/format';

const CATEGORIES: ProductCategory[] = ['BROADBAND', 'VOICE', 'SDWAN', 'HOSTED', 'ADD_ON'];

function formatSpeed(mbps?: number | null): string {
  if (!mbps) {
    return '\u2014';
  }
  if (mbps >= 1000) {
    return `${mbps / 1000} Gbps`;
  }
  return `${mbps} Mbps`;
}

export function CatalogPage() {
  const api = useEndpoints();
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const products = useAsync(() => api.catalog.list(category || undefined), [api, category]);

  return (
    <>
      <h1>Catalog</h1>
      <div className="toolbar">
        <SelectField label="Category" value={category} placeholder="All products"
          options={CATEGORIES.map((c) => ({ value: c, label: humanise(c) }))}
          onChange={(e) => setCategory(e.target.value as ProductCategory | '')} />
      </div>
      <ErrorBanner error={products.error} />
      <div className="table-wrap" aria-busy={products.loading}>
        <table>
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Category</th><th>Speed</th>
              <th style={{ textAlign: 'right' }}>Monthly</th><th style={{ textAlign: 'right' }}>Installation</th>
              <th>Min. term</th><th>Priced</th>
            </tr>
          </thead>
          <tbody>
            {(products.data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>{humanise(p.category)}</td>
                <td>{formatSpeed(p.bandwidthMbps)}</td>
                <td style={{ textAlign: 'right' }}><Money minor={p.monthlyPriceMinor} currency={p.currency} /></td>
                <td style={{ textAlign: 'right' }}><Money minor={p.installPriceMinor} currency={p.currency} /></td>
                <td>{p.minTermMonths} months</td>
                <td>{p.perSite ? 'Per site' : 'Per unit'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Installation is waived on terms of 36 months or more. Prices exclude VAT.</p>
    </>
  );
}

import { formatMoney } from '../lib/money';

interface Props {
  minor: number;
  currency: string;
  /** Show positive values with an explicit "+" (ledger style). */
  signed?: boolean;
}

export function Money({ minor, currency, signed = false }: Props) {
  const text = formatMoney(minor, currency);
  return (
    <span className={`money${minor < 0 ? ' money--negative' : ''}`}>
      {signed && minor > 0 ? `+${text}` : text}
    </span>
  );
}

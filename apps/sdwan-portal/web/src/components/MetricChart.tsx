import { useMemo, useState } from 'react';
import { formatDateTime } from '../lib/format';

export interface Point {
  t: string;
  v: number;
}

interface Props {
  title: string;
  points: Point[];
  unit: string;
  /** SLA limit drawn as a dashed line; points above it are highlighted. */
  threshold?: number;
  /** Bucket width; a gap larger than 1.5 buckets breaks the line instead of interpolating. */
  bucketSeconds: number;
  width?: number;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

/** "Nice" axis maximum: rounds up to 1/2/5 x 10^n so tick labels are readable. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const f = value / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/** Splits points into contiguous runs so missing data shows as a gap, never as a fake straight line. */
export function segments(points: Point[], bucketSeconds: number): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  let prev: number | undefined;
  for (const p of points) {
    const t = Date.parse(p.t);
    if (prev !== undefined && t - prev > bucketSeconds * 1500) {
      out.push(current);
      current = [];
    }
    current.push(p);
    prev = t;
  }
  if (current.length) out.push(current);
  return out;
}

export function MetricChart({ title, points, unit, threshold, bucketSeconds, width = 560, height = 160 }: Props) {
  const [hover, setHover] = useState<Point | null>(null);
  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = Date.parse(points[0].t);
    const t1 = Math.max(t0 + 1, Date.parse(points[points.length - 1].t));
    const yMax = niceMax(Math.max(threshold ?? 0, ...points.map((p) => p.v)) * 1.1);
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const x = (t: string) => PAD.left + ((Date.parse(t) - t0) / (t1 - t0)) * plotW;
    const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
    return { x, y, yMax, plotW };
  }, [points, threshold, width, height]);

  if (!geometry) {
    return (
      <figure className="chart">
        <figcaption>{title}</figcaption>
        <p className="empty">No samples in this range</p>
      </figure>
    );
  }
  const { x, y, yMax, plotW } = geometry;
  const breaches = threshold === undefined ? 0 : points.filter((p) => p.v > threshold).length;

  return (
    <figure className="chart">
      <figcaption>
        {title}
        {threshold !== undefined && (
          <span className={breaches ? 'chart-breach' : 'chart-ok'}>
            {breaches ? ` · ${breaches} interval(s) over ${threshold}${unit}` : ` · within ${threshold}${unit}`}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart`} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(yMax * f)} y2={y(yMax * f)} className="grid" />
            <text x={PAD.left - 6} y={y(yMax * f) + 4} textAnchor="end" className="tick">
              {Number((yMax * f).toPrecision(3))}
            </text>
          </g>
        ))}
        {threshold !== undefined && (
          <line x1={PAD.left} x2={PAD.left + plotW} y1={y(threshold)} y2={y(threshold)} className="threshold" data-testid="threshold" />
        )}
        {segments(points, bucketSeconds).map((seg, i) => (
          <polyline key={i} className="series" fill="none" points={seg.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />
        ))}
        {points.map((p) => (
          <circle
            key={p.t}
            cx={x(p.t)}
            cy={y(p.v)}
            r={threshold !== undefined && p.v > threshold ? 3 : 6}
            className={threshold !== undefined && p.v > threshold ? 'point-breach' : 'point-hit'}
            onMouseEnter={() => setHover(p)}
          />
        ))}
      </svg>
      <div className="chart-readout" aria-live="polite">
        {hover ? `${formatDateTime(hover.t)}: ${hover.v}${unit}` : ' '}
      </div>
    </figure>
  );
}

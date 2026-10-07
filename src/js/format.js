export const DASH = '—';

export function fmtInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : DASH;
}

export function fmtUsdCompact(n) {
  if (!Number.isFinite(n)) return DASH;
  const units = [[1e12, 'T', 2], [1e9, 'B', 2], [1e6, 'M', 1], [1e3, 'K', 1]];
  for (const [v, s, d] of units) {
    if (Math.abs(n) >= v) return `$${(n / v).toFixed(d)}${s}`;
  }
  return `$${n.toFixed(0)}`;
}

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n === 0) return '$0';
  return n < 0.0001 ? `$${n.toExponential(2)}` : `$${n.toPrecision(4)}`;
}

export function fmtChange(n) {
  if (!Number.isFinite(n)) return DASH;
  const arrow = n > 0 ? '▲' : n < 0 ? '▼' : '▬';
  return `${arrow} ${Math.abs(n).toFixed(2)}%`;
}

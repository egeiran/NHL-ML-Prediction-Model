export function formatDateLabel(date: string) {
  if (!date) return 'Ukjent dato';
  return new Date(date).toLocaleDateString('nb-NO', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatShortDate(date: string) {
  if (!date) return 'Ukjent';
  return new Date(date).toLocaleDateString('nb-NO', { month: 'short', day: 'numeric' });
}

export function formatTime(iso?: string | null) {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

export function formatOdds(odds?: number | null) {
  if (odds === null || odds === undefined) return '–';
  return odds.toFixed(2);
}

export function formatPercent(prob?: number | null) {
  if (prob === null || prob === undefined) return '–';
  return `${(prob * 100).toFixed(1)}%`;
}

export function formatValue(value?: number | null) {
  if (value === null || value === undefined) return '–';
  const valuePct = (value * 100).toFixed(1);
  return `${value > 0 ? '+' : ''}${valuePct} pp`;
}

export function valueColor(value?: number | null) {
  if (value === null || value === undefined) return 'text-white';
  if (value > 0) return 'text-emerald-200';
  if (value < 0) return 'text-rose-200';
  return 'text-white';
}

export function formatCurrency(amount: number) {
  return amount.toLocaleString('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
}

export function formatRoi(roi: number) {
  return `${(roi * 100).toFixed(1)}%`;
}

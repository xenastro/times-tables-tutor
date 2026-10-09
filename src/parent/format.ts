import { t } from '../i18n';
import { dayKey } from '../engine/stats';

export function relativeDay(ts: number, now = Date.now()): string {
  const today = new Date(dayKey(now)).getTime();
  const that = new Date(dayKey(ts)).getTime();
  const days = Math.round((today - that) / 86400000);
  if (days <= 0) return t('parent.today');
  if (days === 1) return t('parent.yesterday');
  return t('parent.daysAgo', { n: days });
}

export function seconds(ms: number | null): string {
  return ms == null ? '–' : (ms / 1000).toFixed(1);
}

export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function shortDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

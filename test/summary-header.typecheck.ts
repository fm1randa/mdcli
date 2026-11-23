import { t } from '../src/lib/i18n/index.js';

export function refusesRawSummaryGrouping(raw: string): string {
  // @ts-expect-error raw string is not SummaryGrouping
  t('entriesSummaryHeader', raw, '2026-11-01', '2026-11-30');
  // @ts-expect-error translated label is not SummaryGrouping
  t('summaryGroupColumn', 'Categoria');
  return t('entriesSummaryHeader', 'month', '2026-11-01', '2026-11-30');
}

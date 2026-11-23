import { exitWithError } from '../utils/action.js';
import { t } from '../lib/i18n/index.js';
import { dateRange, isCalendarDate, isYearMonth, monthRange, type DateRange } from '../lib/dates.js';

export interface PeriodOptions {
  month?: string;
  from?: string;
  to?: string;
}

/**
 * The period of `--month` or `--from`/`--to`. A bound left out comes from
 * `fallback`, the command's default period; neither flag means `fallback`.
 */
export function parsePeriodOptions(options: PeriodOptions, fallback: DateRange): DateRange {
  if (options.month !== undefined && (options.from !== undefined || options.to !== undefined)) {
    exitWithError(t('errorBudgetPeriodConflict'));
  }
  if (options.month !== undefined) {
    if (!isYearMonth(options.month)) exitWithError(t('errorInvalidBudgetMonth', options.month));
    return monthRange(options.month);
  }
  if (options.from !== undefined && !isCalendarDate(options.from)) {
    exitWithError(t('errorInvalidFilterDate', '--from', options.from));
  }
  if (options.to !== undefined && !isCalendarDate(options.to)) {
    exitWithError(t('errorInvalidFilterDate', '--to', options.to));
  }
  const start = options.from ?? fallback.start;
  const end = options.to ?? fallback.end;
  const period = dateRange(start, end);
  if (!period) exitWithError(t('errorBudgetRangeReversed', start, end));
  return period;
}

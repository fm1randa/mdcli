import { exitWithError } from '../../utils/action.js';
import { t } from '../../lib/i18n/index.js';
import { addInterval } from '../../lib/dates.js';
import type { CreateEntryAgenda, CreateEntryInstallment } from '../../types/index.js';
import { parseInteger } from '../../utils/parse.js';
import { roundToCents, toCents } from '../../utils/currency.js';

export interface ScheduleOptions {
  repeat?: string;
  frequency?: string;
  times?: string;
  installments?: string;
  firstInstallment?: string;
  perInstallment?: boolean;
}

export interface Schedule {
  agenda: CreateEntryAgenda;
  /** Only for installments: what each occurrence is worth and when it falls. */
  parcelas?: CreateEntryInstallment[];
  /** The entry's valor: the series total for installments, else the value itself. */
  total: number;
}

type Interval = CreateEntryAgenda['intervalo'];

const INTERVAL_MAP: Record<string, Interval> = {
  daily: 'd',
  weekly: 'w',
  monthly: 'M',
  yearly: 'y',
  d: 'd',
  w: 'w',
  m: 'M',
  y: 'y',
};

const INTERVAL_LABELS: Record<Interval, () => string> = {
  d: () => t('intervalDaily'),
  w: () => t('intervalWeekly'),
  M: () => t('intervalMonthly'),
  y: () => t('intervalYearly'),
};

/** The localized name of an agenda interval. */
export function intervalLabel(interval: Interval): string {
  return INTERVAL_LABELS[interval]();
}

function parseInterval(repeat: string): Interval {
  const interval = INTERVAL_MAP[repeat.toLowerCase()];
  if (!interval) {
    exitWithError(t('errorInvalidRepeatInterval', repeat));
  }
  return interval;
}

function parseCount(flag: string, value: string | undefined, min = 1): number | undefined {
  if (value === undefined) return undefined;
  const count = parseInteger(value, min);
  if (count === undefined) {
    exitWithError(t('errorInvalidCount', flag, value, min));
  }
  return count;
}

/**
 * Splits a series total into installments the way the web app's default
 * option does: every installment gets the total divided by the count, rounded
 * to cents, and the first one absorbs the rounding difference (100 in 3 is
 * 33.34 + 33.33 + 33.33). With perInstallment the value is each installment's.
 */
function installmentValues(value: number, count: number, perInstallment: boolean): number[] {
  const sign = value < 0 ? -1 : 1;
  const cents = toCents(value);
  if (perInstallment) return Array.from({ length: count }, () => (sign * cents) / 100);
  const each = Math.round(cents / count);
  const first = cents - each * (count - 1);
  return Array.from({ length: count }, (_, i) => (sign * (i === 0 ? first : each)) / 100);
}

/**
 * Turns --repeat/--frequency/--times (a fixed series) or --installments (a
 * parcelada series) into the agenda the web app sends. `value` is signed.
 */
export function parseSchedule(options: ScheduleOptions, value: number, date: string): Schedule | undefined {
  const frequencia = parseCount('--frequency', options.frequency) ?? 1;
  const times = parseCount('--times', options.times);
  const installments = parseCount('--installments', options.installments, 2);
  const inicial = parseCount('--first-installment', options.firstInstallment);

  if (installments === undefined) {
    if (inicial !== undefined || options.perInstallment) {
      exitWithError(t('errorFirstInstallmentNeedsInstallments'));
    }
    if (!options.repeat) {
      if (options.frequency !== undefined || times !== undefined) {
        exitWithError(t('errorFrequencyNeedsRepeat'));
      }
      return undefined;
    }
    return {
      agenda: { repeticao: 'f', intervalo: parseInterval(options.repeat), quantidade: times ?? -1, frequencia, inicial: 1 },
      total: value,
    };
  }

  if (times !== undefined) {
    exitWithError(t('errorTimesWithInstallments'));
  }
  if (inicial !== undefined && inicial > installments) {
    exitWithError(t('errorFirstInstallmentPastLast', inicial, installments));
  }
  const intervalo = options.repeat ? parseInterval(options.repeat) : 'M';
  const values = installmentValues(value, installments, Boolean(options.perInstallment));
  const parcelas = values.map((valor, i) => ({ valor, data: addInterval(date, i * frequencia, intervalo) }));
  return {
    agenda: { repeticao: 'p', intervalo, quantidade: installments, frequencia, inicial: inicial ?? 1 },
    parcelas,
    total: roundToCents(values.reduce((sum, v) => sum + v, 0)),
  };
}

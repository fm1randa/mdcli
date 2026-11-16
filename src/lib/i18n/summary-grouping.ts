const SUMMARY_GROUPINGS = ['category', 'month', 'account'] as const;

export type SummaryGrouping = (typeof SUMMARY_GROUPINGS)[number];

export function parseSummaryGrouping(input: string | undefined): SummaryGrouping | undefined {
  const value = input ?? 'category';
  for (const grouping of SUMMARY_GROUPINGS) {
    if (grouping === value) return grouping;
  }
  return undefined;
}

export interface GroupNoun {
  column: string;
  header: string;
}

export type GroupNouns = Record<SummaryGrouping, GroupNoun>;

export function groupNouns(category: GroupNoun, month: GroupNoun, account: GroupNoun): GroupNouns {
  return { category, month, account };
}

export interface SummaryGroupingMessages {
  summaryGroupColumn: (by: SummaryGrouping) => string;
  entriesSummaryHeader: (by: SummaryGrouping, from: string, to: string) => string;
}

export function summaryGroupingMessages(
  nouns: GroupNouns,
  header: (noun: string, from: string, to: string) => string,
): SummaryGroupingMessages {
  return {
    summaryGroupColumn: (by) => nouns[by].column,
    entriesSummaryHeader: (by, from, to) => header(nouns[by].header, from, to),
  };
}

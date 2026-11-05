/**
 * Removed values a review proved not to be account data. The key is the
 * normalized sha256; the value is the reason a review can check. Keep this file
 * out of the security surfaces so a false positive on ordinary work does not
 * turn every PR into a risky one; a wrong excuse is still visible here.
 */
export const EXCUSED_REMOVED_TERMS: ReadonlyMap<string, string> = new Map([
  [
    '410773c987d844f496d75d56a5f0ad34fa939769510731dfe5071d9267660008',
    'descriptive mock card name, replaced by "Cartão Teste Sem Vencimento"; not an account card',
  ],
  [
    '3a4d6d2b651fc63457e14b5fe26033e41ec87de862344b859becb8dd13598d4e',
    'small generic invoice component the #177 review intentionally left outside the guard',
  ],
]);

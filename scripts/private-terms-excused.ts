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
  [
    '1388157996a295be011f7b47e551e4a2a307ca9def29a42c1597de5ea1ef6159',
    'TypeScript type names (Uint8Array, Buffer) from the gitBytes signature in scripts/git.ts (#293); not account data',
  ],
  [
    'd4c999ae43633bd2036188d2bca68e1be8202b2cc1f3a1c42a728eaff7d2483d',
    'the Chrome launch timeout in milliseconds from test/browser-helpers.ts, now derived from TEST_TIMEOUT_MS (#293); not account data',
  ],
]);

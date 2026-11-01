import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG_DIR = join(import.meta.dir, '../src/lib/i18n/catalog');

function readCatalog(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8');
  const keys: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const regex = /^[\s]*([a-zA-Z][a-zA-Z0-9]*):/;
    const m = regex.exec(line);
    if (m) {
      const pos = m.index !== undefined ? m.index : 0;
      const before = line.slice(0, pos);
      // Skip parameter names inside function signatures (e.g. `(name: string)`)
        if (before.includes('(')) continue;
        // Skip interface/type property lines (e.g. `name: string,`) but keep
        // multi-line function definitions that end with a comma before closing.
        const after = line.slice(line.indexOf(':') + 1).trim();
        const afterTrim = after.trim();
        if (!line.includes('=>') && /^[a-zA-Z]+$/.test(afterTrim) && !afterTrim.includes('(') && !afterTrim.includes(')')) {
          // Skip interface/type property lines (e.g. `name: string`) but not real values
          continue;
        }
        keys.push(m[1]);
    }
  }
  return keys;
}

function collectKeys(): { ptBR: string[]; en: string[] } {
  const ptBRFiles = readdirSync(join(CATALOG_DIR, 'pt-BR'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(CATALOG_DIR, 'pt-BR', f));
  const enFiles = readdirSync(join(CATALOG_DIR, 'en'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(CATALOG_DIR, 'en', f));
  const ptBRKeys = new Set<string>();
  for (const f of ptBRFiles) {
    for (const k of readCatalog(f)) ptBRKeys.add(k);
  }
  const enKeys = new Set<string>();
  for (const f of enFiles) {
    for (const k of readCatalog(f)) enKeys.add(k);
  }
  return { ptBR: Array.from(ptBRKeys).sort(), en: Array.from(enKeys).sort() };
}

function referencedKeys(): Set<string> {
  const srcDir = [join(import.meta.dir, '../src'), join(import.meta.dir, '../bin')];
  const files = srcDir.flatMap((dir) => {
    try {
      return readdirSync(dir, { recursive: true })
        .filter((f) => typeof f === 'string' && f.endsWith('.ts'))
        .map((f) => readFileSync(join(dir, f as string), 'utf8'));
    } catch {
      return [];
    }
  });
  const refs = new Set<string>();
  for (const content of files) {
    // Direct t('key') or t("key") calls
    const regex = /t\(['"]([a-zA-Z][a-zA-Z0-9]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      refs.add(m[1]);
    }
    // String literal references like 'repetitionSingle' or "repetitionFixed"
    const literalRegex = /['"]([a-zA-Z][a-zA-Z0-9]*)(?=['"])/g;
    while ((m = literalRegex.exec(content)) !== null) {
      refs.add(m[1]);
    }
  }
  return refs;
}

describe('catalog keys', () => {
  test('both catalogs have the same key set', () => {
    const { ptBR, en } = collectKeys();
    const FALSE_POSITIVE_PARAMS = new Set([
      'categoryType', 'entryType', 'id', 'name',
    ]);
    const ptBRFiltered = ptBR.filter((k) => !FALSE_POSITIVE_PARAMS.has(k));
    const enFiltered = en.filter((k) => !FALSE_POSITIVE_PARAMS.has(k));
    expect(ptBRFiltered).toEqual(enFiltered);
  });

  test('every catalog key is referenced from src/', () => {
  const FALSE_POSITIVE_PARAMS = new Set([
    'categoryType', 'entryType', 'id', 'name',
  ]);

  const keys = collectKeys();
  const refs = referencedKeys();
  const missing = keys.ptBR.filter((k) => !FALSE_POSITIVE_PARAMS.has(k) && !refs.has(k));
    expect(missing).toEqual([]);
  });
});

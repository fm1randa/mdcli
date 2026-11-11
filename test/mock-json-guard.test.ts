import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// scripts/mock-*.ts answer through json<route>() (scripts/mock-http.ts), which
// types each payload by test/api-routes.ts; a raw Response.json skips that check.
const SCRIPTS = join(import.meta.dir, '..', 'scripts');
const HELPERS = 'mock-http.ts';

function rawJsonCalls(file: string): string[] {
  return readFileSync(join(SCRIPTS, file), 'utf-8')
    .split('\n')
    .flatMap((line, i) => (line.includes('Response.json(') ? [`${file}:${i + 1}`] : []));
}

describe('mock payloads are typed by route', () => {
  test('no mock route builds a raw Response.json', () => {
    const routes = readdirSync(SCRIPTS).filter((file) => /^mock-.+\.ts$/.test(file) && file !== HELPERS);

    expect(routes).toContain('mock-api.ts');
    expect(routes.flatMap(rawJsonCalls)).toEqual([]);
  });

  test('the scan finds the raw calls the helpers own', () => {
    expect(rawJsonCalls(HELPERS)).toHaveLength(6);
  });
});

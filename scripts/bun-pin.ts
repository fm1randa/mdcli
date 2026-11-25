import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseValueFlag } from './git.js';

const BUN_PREFIX = 'bun@';

/**
 * Compares the packageManager field to the running version.
 * Undefined when the field is `bun@` plus that version. A missing or non-bun
 * field returns its own message with no install line, since there is no bun
 * version to install; it does not throw. No filesystem and no spawn.
 */
export function pinMismatch(packageManagerField: string, runningVersion: string): string | undefined {
  if (!packageManagerField.startsWith(BUN_PREFIX)) {
    return `package.json pede ${packageManagerField || '(nada)'} em packageManager; este repositório espera bun@<versão>.`;
  }
  const pin = packageManagerField.slice(BUN_PREFIX.length);
  if (pin === runningVersion) return undefined;
  return [
    `Bun ${runningVersion} está no PATH. package.json pede ${packageManagerField}.`,
    'Instale esse pin e coloque esse bun antes no PATH:',
    `  curl -fsSL https://bun.sh/install | bash -s "bun-v${pin}"`,
  ].join('\n');
}

/** CLI. No flags: package.json next to this script, and Bun.version. The two flags override both. */
export function bunPinMain(argv: readonly string[]): number {
  let running: string | undefined;
  let field: string | undefined;
  try {
    const runningFlag = parseValueFlag(argv, '--running', 'a version');
    const fieldFlag = parseValueFlag(runningFlag.rest, '--package-manager', 'a packageManager value');
    running = runningFlag.value;
    field = fieldFlag.value;
    const unknown = fieldFlag.rest.find((arg) => arg.startsWith('-'));
    if (unknown !== undefined) throw new Error(`unknown argument: ${unknown}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const packageManagerField = field ?? readPackageManager();
  const message = pinMismatch(packageManagerField, running ?? Bun.version);
  if (message === undefined) return 0;
  console.log(message);
  return 1;
}

function readPackageManager(): string {
  const parsed = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { packageManager?: unknown };
  return typeof parsed.packageManager === 'string' ? parsed.packageManager : '';
}

if (import.meta.main) process.exit(bunPinMain(process.argv.slice(2)));

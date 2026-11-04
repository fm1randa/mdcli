import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProva, parseProva, requiresProva } from '../scripts/prova.js';

const BEFORE = ['### Antes (main)', '', '```sh', '$ mdcli entries import run -a 1001 --dry-run', 'Dry run: 1 entry', '```'].join(
  '\n',
);
const AFTER = ['### Depois (branch)', '', '```sh', '$ mdcli entries import run -a 1001 --dry-run', 'Dry run: 1 entry, 0 changes', '```'].join(
  '\n',
);

describe('parseProva', () => {
  test('the untouched pull request template is not a filled proof', () => {
    const template = readFileSync(join(import.meta.dir, '..', '.github', 'pull_request_template.md'), 'utf8');
    expect(parseProva(template)).toEqual({ present: true, before: false, after: false });
  });

  test('a body without the section is absent', () => {
    expect(parseProva('## Problema\n\ntexto\n\n## Verificação\n\nnada')).toEqual({
      present: false,
      before: false,
      after: false,
    });
  });

  test('an empty section has neither side filled', () => {
    const body = ['## Prova', '', '<!-- rode contra o mock -->', '', '### Antes (main)', '', '### Depois (branch)', ''].join('\n');
    expect(parseProva(body)).toEqual({ present: true, before: false, after: false });
  });

  test('only the before block is not enough', () => {
    const body = ['## Prova', '', BEFORE, '', '### Depois (branch)', '', '<!-- coloque a saída aqui -->', ''].join('\n');
    expect(parseProva(body)).toEqual({ present: true, before: true, after: false });
  });

  test('before and after blocks are a filled proof', () => {
    const body = ['## Problema', '', 'texto', '', '## Prova', '', BEFORE, '', AFTER, '', '## Verificação', '', 'ok'].join('\n');
    expect(parseProva(body)).toEqual({ present: true, before: true, after: true });
  });
});

describe('checkProva', () => {
  test('requires the proof only when src/ changes', () => {
    expect(requiresProva(['README.md', 'docs/adr/0003.md'])).toBe(false);
    expect(requiresProva(['src/commands/entries/list.ts'])).toBe(true);
    expect(requiresProva(['src'])).toBe(true);
  });

  test('fails a src change without a filled proof and passes with one', () => {
    expect(checkProva('## Problema\n\nnada', ['src/program.ts']).ok).toBe(false);
    const body = ['## Prova', '', BEFORE, '', AFTER].join('\n');
    expect(checkProva(body, ['src/program.ts']).ok).toBe(true);
  });

  test('does not require a proof for a docs-only change', () => {
    expect(checkProva('## Problema\n\nnada', ['README.md'])).toEqual({
      required: false,
      ok: true,
      status: { present: false, before: false, after: false },
    });
  });
});

describe('prova CLI', () => {
  const script = join(import.meta.dir, '..', 'scripts', 'prova.ts');

  function run(body: string, files: string): { code: number; out: string; err: string } {
    const dir = mkdtempSync(join(tmpdir(), 'mdcli-prova-'));
    try {
      const bodyFile = join(dir, 'body.md');
      writeFileSync(bodyFile, body);
      const result = Bun.spawnSync(['bun', script, '--body-file', bodyFile, '--files', files], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return {
        code: result.exitCode ?? 1,
        out: result.stdout.toString(),
        err: result.stderr.toString(),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test('passes a src change with before and after and fails without them', () => {
    const filled = ['## Prova', '', BEFORE, '', AFTER].join('\n');
    expect(run(filled, 'src/program.ts').code).toBe(0);

    const failed = run(BEFORE, 'src/program.ts');
    expect(failed.code).toBe(1);
    expect(failed.err).toContain('### Depois (branch)');
  });

  test('passes a docs-only change without the section', () => {
    const result = run('## Problema\n\nnada', 'README.md');
    expect(result.code).toBe(0);
    expect(result.out).toContain('not required');
  });
});

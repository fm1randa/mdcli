import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProva, parseProva, requiresProva } from '../scripts/prova.js';

const BEFORE = ['### Antes (main)', '', '```sh', '$ mdcli entries import run -a 201 --dry-run', 'Dry run: 1 entry', '```'].join(
  '\n',
);
const AFTER = ['### Depois (branch)', '', '```sh', '$ mdcli entries import run -a 201 --dry-run', 'Dry run: 1 entry, 0 changes', '```'].join(
  '\n',
);
const WEB = 'Web: mdb.js 13776-13792 (the sync PUT the web fires on load)';

describe('parseProva', () => {
  test('the untouched pull request template is not a filled proof', () => {
    const template = readFileSync(join(import.meta.dir, '..', '.github', 'pull_request_template.md'), 'utf8');
    expect(parseProva(template)).toEqual({ present: true, web: false, before: false, after: false });
  });

  test('a body without the section is absent', () => {
    expect(parseProva('## Problema\n\ntexto\n\n## Verificação\n\nnada')).toEqual({
      present: false,
      web: false,
      before: false,
      after: false,
    });
  });

  test('an empty section has neither side filled', () => {
    const body = ['## Prova', '', '<!-- rode contra o mock -->', '', '### Antes (main)', '', '### Depois (branch)', ''].join('\n');
    expect(parseProva(body)).toEqual({ present: true, web: false, before: false, after: false });
  });

  test('only the before block is not enough', () => {
    const body = ['## Prova', '', BEFORE, '', '### Depois (branch)', '', '<!-- coloque a saída aqui -->', ''].join('\n');
    expect(parseProva(body)).toEqual({ present: true, web: false, before: true, after: false });
  });

  test('before and after blocks plus a Web line are a filled proof', () => {
    const body = ['## Problema', '', 'texto', '', '## Prova', '', WEB, '', BEFORE, '', AFTER, '', '## Verificação', '', 'ok'].join('\n');
    expect(parseProva(body)).toEqual({ present: true, web: true, before: true, after: true });
  });
});

describe('web evidence', () => {
  function proof(web: string): string {
    return ['## Prova', '', web, '', BEFORE, '', AFTER].join('\n');
  }

  test('accepts a bundle snippet on a Web line', () => {
    expect(parseProva(proof(WEB)).web).toBe(true);
  });

  test('accepts saying there is no web equivalent', () => {
    expect(parseProva(proof('Web: sem equivalente na web')).web).toBe(true);
    expect(parseProva(proof('sem equivalente na web')).web).toBe(true);
  });

  test('an empty Web line and a Web line outside the proof do not count', () => {
    expect(parseProva(proof('Web:')).web).toBe(false);
    const outside = ['## Problema', '', WEB, '', '## Prova', '', BEFORE, '', AFTER].join('\n');
    expect(parseProva(outside).web).toBe(false);
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
    const body = ['## Prova', '', WEB, '', BEFORE, '', AFTER].join('\n');
    expect(checkProva(body, ['src/program.ts']).ok).toBe(true);
  });

  test('fails before and after blocks that cite no web evidence', () => {
    const body = ['## Prova', '', BEFORE, '', AFTER].join('\n');
    expect(checkProva(body, ['src/program.ts'])).toEqual({
      required: true,
      ok: false,
      status: { present: true, web: false, before: true, after: true },
    });
  });

  test('does not require a proof for a docs-only change', () => {
    expect(checkProva('## Problema\n\nnada', ['README.md'])).toEqual({
      required: false,
      ok: true,
      status: { present: false, web: false, before: false, after: false },
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

  test('passes a src change with the Web line and both blocks and fails without them', () => {
    const filled = ['## Prova', '', WEB, '', BEFORE, '', AFTER].join('\n');
    expect(run(filled, 'src/program.ts').code).toBe(0);

    const noWeb = ['## Prova', '', BEFORE, '', AFTER].join('\n');
    const missingWeb = run(noWeb, 'src/program.ts');
    expect(missingWeb.code).toBe(1);
    expect(missingWeb.err).toContain('Web:');

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

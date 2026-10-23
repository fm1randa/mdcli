import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Category } from '../../../types/index.js';
import type { ImportCandidate } from './candidates.js';
import type { ImportDocument, BankTransactionRow } from './document.js';
import { parseEditFile, renderEditFile, withErrors } from './edit-file.js';
import { PlanError, type RunDocument } from './plan.js';
import { planSelection, selectionCategories, type SelectionItem } from './selection.js';

/** The edited run and the categories it imports with. */
export interface EditedRun {
  run: RunDocument;
  categories: Category[];
}

interface EditOptions {
  today: string;
  dryRun: boolean;
  linkable: (row: BankTransactionRow) => readonly ImportCandidate[];
  /** The Category catalog, read once for the file and every round of checks. */
  catalog: () => Promise<readonly Category[]>;
}

/**
 * The --edit loop, like `git rebase -i`: write the file, run $EDITOR, read it back, validate.
 * An invalid file goes back to the editor with `# error:` lines on top; returned unchanged,
 * it aborts. No command line returns null (cancel). The file is removed however this ends.
 */
export async function editRun(
  document: ImportDocument,
  options: EditOptions,
): Promise<EditedRun | null> {
  const editor = process.env.EDITOR?.trim() ?? '';
  if (editor === '') throw new Error('--edit needs $EDITOR (e.g. EDITOR=vim). Nothing was written.');
  const dir = mkdtempSync(join(tmpdir(), 'mdcli-import-'));
  const file = join(dir, 'import.txt');
  try {
    let text = renderEditFile(document, await options.catalog());
    let shownErrors: string[] = [];
    for (;;) {
      writeFileSync(file, text, { mode: 0o600 });
      openEditor(editor, file);
      const edited = readFileSync(file, 'utf-8');
      if (shownErrors.length > 0 && edited === text) {
        throw new Error(`The file is unchanged and still invalid. Nothing was written.\n${shownErrors.join('\n')}`);
      }
      const { items, errors } = parseEditFile(edited, document.transactions);
      if (items.length === 0 && errors.length === 0) return null;
      const outcome = await planItems(document, items, options);
      if ('run' in outcome && errors.length === 0) return outcome;
      shownErrors = [...errors, ...('errors' in outcome ? outcome.errors : [])];
      text = withErrors(edited, shownErrors);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function openEditor(editor: string, file: string): void {
  // Through the shell, like git: $EDITOR may carry arguments (e.g. "code --wait").
  const result = spawnSync(`${editor} "${file}"`, { shell: true, stdio: 'inherit' });
  if (result.error !== undefined) {
    throw new Error(`Could not run $EDITOR (${editor}): ${result.error.message}. Nothing was written.`);
  }
  if (result.status !== 0) {
    const how = result.status === null ? `was stopped by ${result.signal ?? 'a signal'}` : `exited with code ${result.status}`;
    throw new Error(`$EDITOR (${editor}) ${how}. Nothing was written.`);
  }
}

/**
 * The same category check and the same plan as `--plan`. Every problem is collected, so one round shows them all.
 */
async function planItems(
  document: ImportDocument,
  items: readonly SelectionItem[],
  options: EditOptions,
): Promise<EditedRun | { errors: string[] }> {
  const { categories, problems } = await selectionCategories(items, options.catalog);
  // A refused category is already reported; planning that line again would only add "it has no category".
  const usable = items.filter((item) => item.category === undefined || categories.has(item.category));
  try {
    const run = planSelection(document, usable, {
      categories,
      today: options.today,
      dryRun: options.dryRun,
      source: '--edit',
      entryHint: (prefix) => `Write the one to link: conciliate ${prefix} <entryId> ...`,
      linkable: options.linkable,
    });
    return problems.length > 0 ? { errors: problems } : { run, categories: [...categories.values()] };
  } catch (error) {
    if (error instanceof PlanError) return { errors: [...problems, ...error.problems] };
    throw error;
  }
}

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A fake $EDITOR: on its n-th call it saves what it was given and, when a
 * replacement was scripted for that call, overwrites the file with it.
 */
export class FakeEditor {
  private readonly dir = mkdtempSync(join(tmpdir(), 'mdcli-fake-editor-'));

  /** The $EDITOR command; `replacements[n]` is what call n + 1 writes (null keeps the file). */
  script(replacements: (string | null)[], exitCode = 0): string {
    replacements.forEach((text, index) => {
      if (text !== null) writeFileSync(join(this.dir, `write-${index + 1}.txt`), text);
    });
    const script = join(this.dir, 'editor.sh');
    writeFileSync(
      script,
      [
        `dir='${this.dir}'`,
        'n=$(cat "$dir/count" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$dir/count"',
        'echo "$1" > "$dir/path"',
        'cp "$1" "$dir/seen-$n.txt"',
        'if [ -f "$dir/write-$n.txt" ]; then cp "$dir/write-$n.txt" "$1"; fi',
        `exit ${exitCode}`,
        '',
      ].join('\n'),
    );
    return `sh ${script}`;
  }

  /** The file as the editor received it on its n-th call. */
  seen(call: number): string {
    return readFileSync(join(this.dir, `seen-${call}.txt`), 'utf-8');
  }

  calls(): number {
    const file = join(this.dir, 'count');
    return existsSync(file) ? Number.parseInt(readFileSync(file, 'utf-8'), 10) : 0;
  }

  /** Starts counting calls again. */
  resetCalls(): void {
    rmSync(join(this.dir, 'count'), { force: true });
  }

  editedPath(): string {
    return readFileSync(join(this.dir, 'path'), 'utf-8').trim();
  }

  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

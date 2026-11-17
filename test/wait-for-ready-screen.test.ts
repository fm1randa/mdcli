import { expect, test } from 'bun:test';
import { attachTerminal } from './run.js';
import { waitFor } from './timeouts.js';

test('a prompt already in the buffer still matches after the child has exited', async () => {
  let raw = '';
  const decoder = new TextDecoder();
  const term = attachTerminal([process.execPath, '-e', 'process.stdout.write("ready-prompt")'], {
    cols: 80,
    rows: 24,
    onData(chunk) {
      raw += decoder.decode(chunk);
    },
  });
  try {
    await term.exited;
    const arrived = await waitFor(() => (raw.includes('ready-prompt') ? raw : null));
    expect(arrived).toContain('ready-prompt');
    expect(term.exitCode()).not.toBeNull();
    const seen = await waitFor(
      () => (raw.includes('ready-prompt') ? raw : null),
      { abort: () => term.exitCode() !== null },
    );
    expect(seen).toBe(arrived);
  } finally {
    term.kill();
    term.close();
  }
});

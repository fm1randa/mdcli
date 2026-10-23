import { describe, expect, test } from 'bun:test';
import { mapConcurrent } from '../src/utils/concurrency.js';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets pending promise callbacks run so the workers pick up their next items. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mapConcurrent', () => {
  test.each([0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY])('rejects limit %p without calling fn', async (limit) => {
    let calls = 0;
    const run = mapConcurrent([1, 2, 3], limit, async (n) => {
      calls++;
      return n;
    });

    await expect(run).rejects.toThrow(RangeError);
    await expect(run).rejects.toThrow('limit must be an integer >= 1');
    expect(calls).toBe(0);
  });

  test('returns results in item order even when calls finish out of order', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const run = mapConcurrent([0, 1, 2], 3, async (i) => {
      await gates[i].promise;
      return `item ${i}`;
    });

    gates[2].resolve();
    await flush();
    gates[0].resolve();
    await flush();
    gates[1].resolve();

    expect(await run).toEqual(['item 0', 'item 1', 'item 2']);
  });

  test('keeps at most limit calls in flight', async () => {
    const gates = Array.from({ length: 5 }, deferred);
    const started: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const run = mapConcurrent([0, 1, 2, 3, 4], 2, async (i) => {
      started.push(i);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gates[i].promise;
      inFlight--;
      return i * 10;
    });

    await flush();
    expect(started).toEqual([0, 1]);

    gates[1].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);

    for (const gate of gates) gate.resolve();
    expect(await run).toEqual([0, 10, 20, 30, 40]);
    expect(maxInFlight).toBe(2);
  });

  test('works with a limit larger than the number of items', async () => {
    expect(await mapConcurrent(['a', 'b'], 10, async (s) => s.toUpperCase())).toEqual(['A', 'B']);
  });

  test('returns [] for no items', async () => {
    let calls = 0;
    expect(
      await mapConcurrent([], 4, async () => {
        calls++;
      })
    ).toEqual([]);
    expect(calls).toBe(0);
  });
});

/**
 * fn over every item with at most `limit` calls in flight, results in the
 * items' order (not the order the calls finish in). Rejects with a RangeError
 * when `limit` is not an integer >= 1, which would otherwise start no calls.
 */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapConcurrent: limit must be an integer >= 1, got ${limit}`);
  }
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Responses and payload readers shared by the scripts/mock-api.ts routes.
import { isPositiveSafeInteger, parseId } from '../src/utils/parse.js';

export type Body = Record<string, unknown>;

export function notFound(): Response {
  return Response.json({ message: 'not found' }, { status: 404 });
}

export function badRequest(message: string): Response {
  return Response.json({ message }, { status: 400 });
}

export async function readJsonBody(req: Request): Promise<Body | Response> {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) {
    return Response.json({ message: 'expected a JSON body' }, { status: 415 });
  }
  try {
    return (await req.json()) as Body;
  } catch {
    return badRequest('invalid JSON body');
  }
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

// The routes check a payload before they build an answer from it, so a field
// that is still not a number here is a CLI regression: fail the request loudly
// instead of coercing it the way Number() would.
export function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`mock: ${field} must be a number, got ${JSON.stringify(value)}`);
  return value;
}

/** An account ID as the CLI sends it: a JSON number, or a digit string in a create payload's conta. */
export function idOf(value: unknown): number | undefined {
  if (typeof value === 'string') return parseId(value);
  return isPositiveSafeInteger(value) ? value : undefined;
}

export function requiredId(value: unknown, field: string): number {
  const id = idOf(value);
  if (id === undefined) throw new Error(`mock: ${field} must be an ID, got ${JSON.stringify(value)}`);
  return id;
}

export function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

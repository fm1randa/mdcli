// Readers for untyped API payloads: a field of the wrong type becomes null, never a guess.
import { parseId } from '../utils/parse.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/** A JS integer only. Connection payload ids are numbers. */
export function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** An id as a JS integer or as a positive decimal-integer string (`_ca` and the AI send strings). */
export function idOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string') return parseId(value) ?? null;
  return null;
}

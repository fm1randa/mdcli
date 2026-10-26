import { asRecord } from './payload.js';

/** The web's window.mdconfig: `payload.ngInit` of the logged-in session state. It carries credentials: read fields, never print it. */
export type WebConfig = Record<string, unknown>;

/**
 * The session state the web boots from, read like session.js: the app runs at /u/<uid>/, whose uid
 * bootstrap.js (line 2) passes on and session.js (line 14) sends as GET /frontend/sessao?uid=; only
 * the "app" branch mounts the app and keeps payload.ngInit as window.mdconfig. A failed request or
 * any other branch gives null, and each reader falls back to the web's defaults.
 * `get` is the authenticated API GET; `uid`, the logged-in user's.
 */
export async function loadWebConfig(get: (endpoint: string) => Promise<unknown>, uid: string | undefined): Promise<WebConfig | null> {
  const query = new URLSearchParams();
  if (uid) query.set('uid', uid);
  const search = query.toString();
  let state: Record<string, unknown> | null;
  try {
    state = asRecord(await get(`/v1/frontend/sessao${search ? `?${search}` : ''}`));
  } catch {
    return null;
  }
  return state?.branch === 'app' ? asRecord(asRecord(state.payload)?.ngInit) : null;
}

const SESSION_URL = 'https://app.meudinheiroweb.com.br/api/v1/frontend/sessao';

/** The frontend's public API key, served to logged-out visitors too. */
export async function fetchPublicApiKey(): Promise<string | undefined> {
  try {
    const response = await fetch(SESSION_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { payload?: { api?: { key?: unknown } } };
    const key = body.payload?.api?.key;
    return typeof key === 'string' && key !== '' ? key : undefined;
  } catch {
    return undefined;
  }
}

export function extractUidFromJwt(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return payload.uids ? String(payload.uids) : null;
  } catch {
    return null;
  }
}

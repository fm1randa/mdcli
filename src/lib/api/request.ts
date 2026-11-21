import type { AuthConfig, AuthMethod } from '../../types/index.js';
import { getAuth, getAuthMethod, setAuth, getOpItem, invalidateNameCache } from '../config.js';
import { popStaleNameCacheUse } from '../cache-invalidation.js';
import { captureAuthHeadless } from '../browser-auth.js';
import { extractSessionFromBrowser } from '../browser-session/index.js';
import { t } from '../i18n/index.js';
import { ApiError, parseErrorBody } from '../api-error.js';
import { DEFAULT_API_URL, WEB_ORIGIN, WEB_URL } from '../meu-dinheiro-host.js';

/** Read at call time, so a test or caller that sets MDCLI_API_URL after import still reaches it. */
function apiBaseUrl(): string {
  return process.env.MDCLI_API_URL ?? DEFAULT_API_URL;
}

let refreshPromise: Promise<AuthConfig> | null = null;

function buildHeaders(auth: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Mdapikey: auth.apiKey,
    Mduid: auth.uid,
  };
  if (auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
    headers.Cookie = `mdauthtoken0=${auth.token}`;
  }
  return headers;
}

async function reacquireAuth(): Promise<{ auth: AuthConfig; method: AuthMethod }> {
  const method = getAuthMethod();

  switch (method) {
    case 'browser-chrome':
      return { auth: await extractSessionFromBrowser({ browser: 'chrome' }), method };
    case 'browser-edge':
      return { auth: await extractSessionFromBrowser({ browser: 'edge' }), method };
    case 'browser-firefox':
      return { auth: await extractSessionFromBrowser({ browser: 'firefox' }), method };
    case '1password': {
      const opItem = getOpItem();
      if (opItem) {
        return { auth: await captureAuthHeadless(opItem), method };
      }
      break;
    }
  }

  // manual and browser-manual need a human in the loop, so there's nothing to retry automatically.
  throw new Error(t('errorReauth'));
}

/** Refreshes auth once and shares the result: concurrent 401s (e.g. the
 * parallel lookups in entries loadNames) all wait for the same refresh and
 * then retry with the new credentials instead of failing. */
async function getRefreshedAuth(): Promise<AuthConfig> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // stderr: a refresh can fire inside --json/--csv commands, where
      // stdout must stay machine-readable.
      console.error(t('refreshingCredentials'));
      const { auth: newAuth, method } = await reacquireAuth();
      setAuth(newAuth, method);
      console.error(t('credentialsRefreshed'));
      return newAuth;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Shared response handling for every request: a failure invalidates a
 * possibly stale name-cache use and keeps the API's error body in the message;
 * an empty body (DELETE answers 204) resolves to undefined. `context` (method +
 * endpoint) goes into every error so a bad response points at its request. */
async function readResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const cachedType = popStaleNameCacheUse();
    if (cachedType) invalidateNameCache(cachedType);
    const errorText = await response.text();
    throw new ApiError(t('errorApiRequestFailed', context, response.status, response.statusText, errorText), response.status, parseErrorBody(errorText));
  }

  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(t('errorApiInvalidJson', context, reason), { cause: error });
  }
}

function buildWriteHeaders(auth: AuthConfig): Record<string, string> {
  return {
    ...buildHeaders(auth),
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json, text/plain, */*',
    'Origin': WEB_ORIGIN,
    'Referer': WEB_URL,
  };
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Shared auth + fetch + 401-retry + error handling for GET/POST/PUT/DELETE. */
export async function request<T>(method: HttpMethod, endpoint: string, body?: unknown): Promise<T> {
  const auth = getAuth();
  if (!auth) {
    throw new Error(t('errorNotAuthenticated'));
  }

  const url = `${apiBaseUrl()}${endpoint}`;
  const headersFor = (a: AuthConfig): Record<string, string> =>
    method === 'GET'
      ? buildHeaders(a)
      : buildWriteHeaders(a);

  const doFetch = (a: AuthConfig) =>
    fetch(url, {
      method,
      headers: headersFor(a),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  const context = `${method} ${endpoint}`;
  const response = await doFetch(auth);

  if (response.status === 401) {
    // Refresh once (shared with concurrent 401s) and retry with the new credentials.
    const retried = await doFetch(await getRefreshedAuth());
    return readResponse<T>(retried, t('contextAfterRefresh', context));
  }

  return readResponse<T>(response, context);
}

/** Authenticated GET. A module that imports only this cannot write. */
export const apiGet = <T>(endpoint: string): Promise<T> => request<T>('GET', endpoint);
export const apiPost = <T>(endpoint: string, body: unknown): Promise<T> => request<T>('POST', endpoint, body);

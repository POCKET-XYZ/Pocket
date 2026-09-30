/** Base URL of the Pocket API, including the `/api` prefix. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'
).replace(/\/+$/, '');

const TOKEN_KEY = 'pocket.token';

/** An error answered by the API, with its status and optional machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

const TOKEN_EVENT = 'pocket:token';

export function setToken(token: string | null): void {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Subscribe to token changes in this tab and in other tabs, for useSyncExternalStore. */
export function subscribeToken(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY) onChange();
  };
  window.addEventListener(TOKEN_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(TOKEN_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Call the Pocket API. Sends the session token when there is one. */
export async function api<T>(
  path: string,
  options: { method?: Method; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // The browser only says "Failed to fetch": the API is down, the URL is
    // wrong, or CORS does not allow this origin.
    throw new ApiError(
      0,
      `Cannot reach the Pocket API at ${API_URL}. Check that it is running and allows this site.`,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: probably NEXT_PUBLIC_API_URL points somewhere that is not the API.
  }
  if (!response.ok) {
    const body = (payload ?? {}) as { message?: string | string[]; code?: string };
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new ApiError(response.status, message ?? response.statusText, body.code);
  }
  return payload as T;
}

/** Send a file to the Pocket API as multipart form data, with the session token. */
export async function upload<T>(path: string, field: string, file: File): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append(field, file);
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    // No content-type: the browser sets the multipart boundary itself.
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  }).catch(() => {
    throw new ApiError(0, `Cannot reach the Pocket API at ${API_URL}.`);
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[]; code?: string }
    | null;
  if (!response.ok) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join('. ')
      : payload?.message;
    throw new ApiError(
      response.status,
      response.status === 413 ? 'The file is too big. The limit is 4 MB' : (message ?? response.statusText),
      payload?.code,
    );
  }
  return payload as T;
}

/** A readable message for any error, for toasts and inline alerts. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Wallets reject with plain objects such as { code, message }, not Errors.
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong';
}

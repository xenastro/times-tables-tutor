export const PARENT_LOCKED = 'parent:locked';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const code = (data as { error?: string })?.error ?? 'server_error';
    // A parent area shared with a child locks itself when idle: show the unlock screen.
    if (code === 'locked' && typeof window !== 'undefined') window.dispatchEvent(new Event(PARENT_LOCKED));
    throw new ApiError(res.status, code);
  }
  return data as T;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. testing over a LAN IP).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The browser's short description of the phone, shown to the parent under "Linked phones". */
export function phoneLabel(): string | null {
  return navigator.userAgent.match(/\(([^)]+)\)/)?.[1]?.slice(0, 60) ?? null;
}

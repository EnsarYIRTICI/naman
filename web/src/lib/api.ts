export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: string[]) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; details?: string[] };
    throw new ApiError(d.error || "HTTP " + res.status, res.status, d.details);
  }
  return data as T;
}

export const send = <T,>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  api<T>(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

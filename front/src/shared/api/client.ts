// Thin typed client over fetch. All paths are relative /api/* (Vite dev-proxy).
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* body is not JSON — keep the status */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

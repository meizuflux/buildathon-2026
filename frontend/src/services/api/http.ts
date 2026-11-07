import type { z } from 'zod';
export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'ApiError'; }
}
export function makeHttpClient(baseUrl: string, getToken: () => Promise<string | null>, timeoutMs = 15000) {
  return async function request<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; signal?: AbortSignal; timeout?: number; idempotencyKey?: string } = {}): Promise<T> {
    if (!baseUrl) throw new ApiError('Set EXPO_PUBLIC_API_BASE_URL to connect to your team’s backend.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, options.timeout ?? timeoutMs);
    try {
      const token = await getToken();
      const response = await fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', signal: controller.signal, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
      if (!response.ok) {
        let detail = '';
        try { const error = await response.json(); if (typeof error?.error?.message === 'string') detail = error.error.message.slice(0, 400); } catch {}
        throw new ApiError(detail || (response.status === 401 ? 'Please sign in again.' : response.status === 503 ? 'The service is temporarily unavailable. Please try again.' : 'Request failed (' + response.status + '). Please try again.'), response.status);
      }
      let data: unknown = null;
      if (response.status !== 204) {
        try { data = await response.json(); } catch { throw new ApiError('The server returned invalid JSON. Please try again.'); }
      }
      const result = schema.safeParse(data);
      if (!result.success) throw new ApiError('The server response did not match the expected API contract.');
      return result.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(options.signal?.aborted ? 'Request cancelled.' : 'The request timed out. Please try again.');
      throw new ApiError('Unable to reach Haven. Check your connection and try again.');
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  };
}

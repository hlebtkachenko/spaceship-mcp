const BASE_URL = "https://spaceship.dev/api";
const TIMEOUT_MS = 30_000;
const FORBIDDEN_PATH = /[#]|\.\./;

export interface SpaceshipConfig {
  apiKey: string;
  apiSecret: string;
}

export function validatePath(path: string): void {
  if (FORBIDDEN_PATH.test(path)) {
    throw new Error(`Unsafe API path rejected: "${path}"`);
  }
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": "${path}"`);
  }
}

export class SpaceshipClient {
  private apiKey: string;
  private apiSecret: string;

  constructor(config: SpaceshipConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    validatePath(path);

    let url = `${BASE_URL}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += "?" + new URLSearchParams(query).toString();
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "X-Api-Secret": this.apiSecret,
    };

    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    if (bodyStr) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text();

    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const err = JSON.parse(text) as { detail?: string };
        if (err.detail) detail = err.detail.slice(0, 500);
      } catch { /* use raw text */ }
      throw new Error(`Spaceship ${method.toUpperCase()} ${path} → ${res.status}: ${detail}`);
    }

    const asyncOpId = res.headers.get("spaceship-async-operationid");
    if (res.status === 202 && asyncOpId) {
      return { asyncOperationId: asyncOpId } as T;
    }

    if (res.status === 204 || !text) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  get<T = unknown>(path: string, query?: Record<string, string>) {
    return this.request<T>("GET", path, undefined, query);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  del<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("DELETE", path, body);
  }
}

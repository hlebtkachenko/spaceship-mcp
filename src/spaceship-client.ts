import { ResponseCache } from "./cache.js";

const BASE_URL = "https://spaceship.dev/api";
const TIMEOUT_MS = 30_000;
const FORBIDDEN_PATH = /[#]|\.\./;

const RECOVERY_HINTS: Record<number, string> = {
  401: "Check SPACESHIP_API_KEY and SPACESHIP_API_SECRET values.",
  403: "Your API key may lack the required scope. See https://www.spaceship.com/application/api-manager/",
  404: "The resource does not exist. Verify the domain name or ID.",
  422: "The request data is invalid. Check parameter formats and constraints.",
  429: "Rate limit exceeded. The request will be retried automatically.",
  500: "Spaceship internal error. Try again in a few seconds.",
};

export interface SpaceshipConfig {
  apiKey: string;
  apiSecret: string;
  cacheTtl?: number;
  maxRetries?: number;
}

export function validatePath(path: string): void {
  if (FORBIDDEN_PATH.test(path)) {
    throw new Error(`Unsafe API path rejected: "${path}"`);
  }
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with "/": "${path}"`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SpaceshipClient {
  private apiKey: string;
  private apiSecret: string;
  private maxRetries: number;
  readonly cache: ResponseCache;

  constructor(config: SpaceshipConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.maxRetries = config.maxRetries ?? 3;
    this.cache = new ResponseCache(config.cacheTtl ?? 120);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    validatePath(path);

    const upperMethod = method.toUpperCase();
    let url = `${BASE_URL}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += "?" + new URLSearchParams(query).toString();
    }

    const cacheKey = `${upperMethod}:${url}`;
    if (upperMethod === "GET" && this.cache.enabled) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "X-Api-Secret": this.apiSecret,
    };

    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    if (bodyStr) headers["Content-Type"] = "application/json";

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: upperMethod,
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.min(1000 * 2 ** attempt, 30_000);

          if (attempt < this.maxRetries) {
            await sleep(waitMs);
            continue;
          }
        }

        const text = await res.text();

        if (!res.ok) {
          let detail = text.slice(0, 500);
          try {
            const err = JSON.parse(text) as { detail?: string; message?: string };
            detail = (err.detail || err.message || text).slice(0, 500);
          } catch { /* raw text */ }

          const hint = RECOVERY_HINTS[res.status] || "";
          const hintSuffix = hint ? `\nRecovery: ${hint}` : "";
          throw new Error(
            `Spaceship ${upperMethod} ${path} → ${res.status}: ${detail}${hintSuffix}`,
          );
        }

        const asyncOpId = res.headers.get("spaceship-async-operationid");
        if (res.status === 202 && asyncOpId) {
          return { asyncOperationId: asyncOpId } as T;
        }

        if (res.status === 204 || !text) {
          if (upperMethod !== "GET") this.invalidateRelated(path);
          return undefined as T;
        }

        let parsed: T;
        try {
          parsed = JSON.parse(text) as T;
        } catch {
          parsed = text as T;
        }

        if (upperMethod === "GET" && this.cache.enabled) {
          this.cache.set(cacheKey, parsed);
        } else if (upperMethod !== "GET") {
          this.invalidateRelated(path);
        }

        return parsed;
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).name === "TimeoutError" && attempt < this.maxRetries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        if (attempt >= this.maxRetries) break;
        const msg = (err as Error).message || "";
        if (msg.includes("429")) continue;
        break;
      }
    }

    throw lastError ?? new Error(`Spaceship ${upperMethod} ${path} failed after retries`);
  }

  private invalidateRelated(path: string): void {
    const domainMatch = path.match(/^\/v1\/domains\/([^/]+)/);
    if (domainMatch) {
      this.cache.invalidate(domainMatch[1]);
    }
    if (path.startsWith("/v1/dns/")) {
      const dnsMatch = path.match(/^\/v1\/dns\/records\/([^/?]+)/);
      if (dnsMatch) this.cache.invalidate(dnsMatch[1]);
    }
    if (path.startsWith("/v1/contacts")) {
      this.cache.invalidate("/v1/contacts");
    }
    if (path.startsWith("/v1/sellerhub")) {
      this.cache.invalidate("/v1/sellerhub");
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

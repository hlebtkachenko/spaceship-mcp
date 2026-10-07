import { ResponseCache } from "./cache.js";

const DEFAULT_BASE_URL = "https://spaceship.dev/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const FORBIDDEN_PATH = /[#]|\.\./;
const RETRY_ON_TIMEOUT = new Set(["GET", "PUT", "DELETE"]);
// Status reads that change on their own: never serve them from cache.
const NO_CACHE = /^\/v1\/(async-operations\/|domains\/[^/]+\/transfer(\/|$))/;

const RECOVERY_HINTS: Record<number, string> = {
  401: "Check SPACESHIP_API_KEY and SPACESHIP_API_SECRET values.",
  403: "Your API key may lack the required scope. See https://www.spaceship.com/application/api-manager/",
  404: "The resource does not exist. Verify the domain name or ID.",
  422: "The request data is invalid. Check parameter formats and constraints.",
  429: "Rate limit exceeded. Wait a minute before trying again.",
  500: "Spaceship internal error. Try again in a few seconds.",
};

export interface AsyncOperationResult {
  asyncOperationId: string;
}

export interface SpaceshipConfig {
  apiKey: string;
  apiSecret: string;
  cacheTtl?: number;
  maxRetries?: number;
  baseUrl?: string;
  timeoutMs?: number;
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
  private baseUrl: string;
  private timeoutMs: number;
  readonly cache: ResponseCache;

  constructor(config: SpaceshipConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    let url = `${this.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += "?" + new URLSearchParams(query).toString();
    }

    const cacheKey = `${upperMethod}:${url}`;
    const cacheable = upperMethod === "GET" && this.cache.enabled && !NO_CACHE.test(path);
    if (cacheable) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) return cached;
    }

    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "X-Api-Secret": this.apiSecret,
    };

    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    if (bodyStr) headers["Content-Type"] = "application/json";

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      let text: string;
      try {
        res = await fetch(url, {
          method: upperMethod,
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        text = await res.text();
      } catch (err) {
        if ((err as Error).name !== "TimeoutError") throw err;
        const after = `Spaceship ${upperMethod} ${path} timed out after ${this.timeoutMs / 1000}s`;
        // A timed-out POST/PATCH may still have been processed (registration, renewal, payment):
        // repeating it could charge twice, so report it instead of retrying.
        if (!RETRY_ON_TIMEOUT.has(upperMethod)) {
          throw new Error(
            `${after}: outcome unknown. The request may have been processed. Do not repeat it; ` +
              "check the result first with ss_async_status, ss_domain_info or the matching read tool.",
          );
        }
        if (attempt >= this.maxRetries) throw new Error(`${after} (${attempt + 1} attempts)`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      // 429 means the request was not processed, so it is safe to retry for every method.
      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * 2 ** attempt, 30_000);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        let detail = text.slice(0, 500);
        try {
          const err = JSON.parse(text) as {
            detail?: string;
            message?: string;
            data?: { field?: string; details?: string }[];
          };
          detail = (err.detail || err.message || text).slice(0, 500);
          if (Array.isArray(err.data) && err.data.length) {
            detail += "\n" + err.data.map((d) => `- ${d.field}: ${d.details}`).join("\n");
          }
        } catch { /* raw text */ }

        const hint = RECOVERY_HINTS[res.status] || "";
        const hintSuffix = hint ? `\nRecovery: ${hint}` : "";
        throw new Error(
          `Spaceship ${upperMethod} ${path} → ${res.status}: ${detail}${hintSuffix}`,
        );
      }

      if (upperMethod !== "GET") this.invalidateRelated(path);

      // Async operations return 202 with an operation ID header.
      // Callers expecting this should use T = AsyncOperationResult.
      const asyncOpId = res.headers.get("spaceship-async-operationid");
      if (res.status === 202 && asyncOpId) {
        return { asyncOperationId: asyncOpId } as unknown as T;
      }

      // 204 No Content or empty body — callers should handle undefined via
      // T that includes undefined (e.g. void) or optional chaining.
      if (res.status === 204 || !text) {
        return undefined as unknown as T;
      }

      let parsed: T;
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        throw new Error(
          `Spaceship ${upperMethod} ${path}: expected JSON response but got: ${text.slice(0, 200)}`,
        );
      }

      if (cacheable) this.cache.set(cacheKey, parsed);
      return parsed;
    }
  }

  private invalidateRelated(path: string): void {
    const domainMatch = path.match(/^\/v1\/domains\/([^/]+)/);
    if (domainMatch) {
      this.cache.invalidate(domainMatch[1]);
      this.cache.invalidate("/v1/domains?");
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

/**
 * Low-level HTTP client for ESPN's public (unofficial, unauthenticated) API.
 * Handles base-URL resolution per sport/league, retry/backoff, short-TTL
 * response caching, and defensive rate-limiting since ESPN publishes no SLA.
 */

import { espnLeaguePath } from "@/lib/leagues/registry";

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_API_BASE = "https://sports.core.api.espn.com/v2/sports";
const SITE_WEB_API_BASE = "https://site.web.api.espn.com/apis/common/v3/sports";

/** ESPN sport/league path segment for a registered league, e.g. "nfl" -> "football/nfl". */
export function leaguePath(league: string): string {
  return espnLeaguePath(league);
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface RequestOptions {
  /** Cache TTL in ms for this request. 0 disables caching. Default 30s. */
  ttlMs?: number;
  /** Max retry attempts on 429/5xx. Default 3. */
  maxRetries?: number;
}

/**
 * Thin wrapper over `fetch` for ESPN's site & core APIs. Instances are
 * cheap and stateless aside from the in-memory cache, so a single shared
 * instance (see `espnClient` below) is fine for a process's lifetime.
 */
export class EspnClient {
  private cache = new Map<string, CacheEntry>();
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;

  constructor(
    private readonly siteBase: string = SITE_API_BASE,
    private readonly coreBase: string = CORE_API_BASE,
    minIntervalMs = 250,
    private readonly siteWebBase: string = SITE_WEB_API_BASE,
  ) {
    this.minIntervalMs = minIntervalMs;
  }

  /** GET against the site API, e.g. `getSite("football/nfl/scoreboard")`. */
  async getSite<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(`${this.siteBase}/${path}`, options);
  }

  /** GET against the core API (used for odds, splits). */
  async getCore<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(`${this.coreBase}/${path}`, options);
  }

  /**
   * GET against the `site.web.api.espn.com` common/v3 API. Unlike the core
   * API's `athletes/{id}/gamelog`, which 404s consistently, this is the
   * endpoint that actually returns gamelog data — see docs/espn_response_schemas.md.
   */
  async getWeb<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(`${this.siteWebBase}/${path}`, options);
  }

  /** GET an arbitrary absolute URL (core API responses often embed `$ref` links). */
  async getRef<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(url, options);
  }

  private async get<T>(url: string, options?: RequestOptions): Promise<T> {
    const ttlMs = options?.ttlMs ?? 30_000;
    const maxRetries = options?.maxRetries ?? 3;

    if (ttlMs > 0) {
      const cached = this.cache.get(url);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[espn] cache hit: ${url}`);
        return cached.value as T;
      }
    }

    const startedAt = Date.now();
    const value = await this.fetchWithRetry<T>(url, maxRetries);
    console.log(`[espn] ${url} completed in ${Date.now() - startedAt}ms`);

    if (ttlMs > 0) {
      this.cache.set(url, { value, expiresAt: Date.now() + ttlMs });
    }

    return value;
  }

  private async fetchWithRetry<T>(url: string, maxRetries: number): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.throttle();

      console.log(`[espn] GET ${url}${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries + 1})` : ""}`);
      const response = await fetch(url);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        console.error(`[espn] request failed (${response.status}), giving up: ${url}`);
        throw new Error(`ESPN API request failed (${response.status}): ${url}`);
      }

      const backoffMs = 2 ** attempt * 500;
      console.warn(`[espn] request failed (${response.status}), retrying in ${backoffMs}ms: ${url}`);
      await sleep(backoffMs);
      attempt += 1;
    }
  }

  /** Defensive spacing between outbound requests since ESPN's API is unofficial/undocumented. */
  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared client instance for the app's lifetime — reuses the cache across calls in a run. */
export const espnClient = new EspnClient();

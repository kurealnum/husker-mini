/**
 * Low-level HTTP client for ESPN's public (unofficial, unauthenticated) API.
 * Handles base-URL resolution per sport/league, retry/backoff, short-TTL
 * response caching, and defensive rate-limiting since ESPN publishes no SLA.
 */

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_API_BASE = "https://sports.core.api.espn.com/v2/sports";

/** ESPN sport/league path segment, e.g. "nfl" -> "football/nfl". */
export const ESPN_LEAGUE_PATHS: Record<string, string> = {
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  mlb: "baseball/mlb",
  ncaaf: "football/college-football",
  ncaab: "basketball/mens-college-basketball",
};

export function leaguePath(sport: string): string {
  const path = ESPN_LEAGUE_PATHS[sport];
  if (!path) throw new Error(`Unsupported ESPN sport/league: ${sport}`);
  return path;
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
  ) {
    this.minIntervalMs = minIntervalMs;
  }

  /** GET against the site API, e.g. `getSite("football/nfl/scoreboard")`. */
  async getSite<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(`${this.siteBase}/${path}`, options);
  }

  /** GET against the core API (used for gamelogs, odds, splits). */
  async getCore<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(`${this.coreBase}/${path}`, options);
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
        return cached.value as T;
      }
    }

    const value = await this.fetchWithRetry<T>(url, maxRetries);

    if (ttlMs > 0) {
      this.cache.set(url, { value, expiresAt: Date.now() + ttlMs });
    }

    return value;
  }

  private async fetchWithRetry<T>(url: string, maxRetries: number): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.throttle();

      const response = await fetch(url);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new Error(`ESPN API request failed (${response.status}): ${url}`);
      }

      const backoffMs = 2 ** attempt * 500;
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

/**
 * Audits ESPN's public API for every league the "Support new sports" epic
 * targets, and every endpoint the prediction pipeline may call. Discovers a
 * sample team and athlete id per league on the fly (teams -> roster) so
 * team-scoped and athlete-scoped endpoints can be probed too, and writes a
 * dated markdown results table to docs/espn-endpoint-audit.md.
 *
 * Run with: npx tsx scripts/audit-espn-endpoints.ts
 *
 * This script only records facts (issue #156); it does not change any
 * pipeline behavior. The league registry (src/lib/leagues/registry.ts)
 * consumes these results when a new league's pipeline is built.
 */

const SITE_API_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_API_BASE = "https://sports.core.api.espn.com/v2/sports";
const SITE_WEB_API_BASE = "https://site.web.api.espn.com/apis/common/v3/sports";
const V2_API_BASE = "https://site.api.espn.com/apis/v2/sports";

/** One league to audit: its ESPN sport/league path segments and whether it has an event leaderboard instead of a scoreboard. */
interface LeagueTarget {
  key: string;
  path: string;
  hasLeaderboard?: boolean;
}

const LEAGUES: LeagueTarget[] = [
  { key: "nfl", path: "football/nfl" },
  { key: "college-football", path: "football/college-football" },
  { key: "nba", path: "basketball/nba" },
  { key: "mens-college-basketball", path: "basketball/mens-college-basketball" },
  { key: "nhl", path: "hockey/nhl" },
  { key: "mlb", path: "baseball/mlb" },
  { key: "eng.1", path: "soccer/eng.1" },
  { key: "usa.1", path: "soccer/usa.1" },
  { key: "atp", path: "tennis/atp" },
  { key: "wta", path: "tennis/wta" },
  { key: "ufc", path: "mma/ufc" },
  { key: "pga", path: "golf/pga", hasLeaderboard: true },
  { key: "mens-college-volleyball", path: "volleyball/mens-college-volleyball" },
  { key: "womens-college-volleyball", path: "volleyball/womens-college-volleyball" },
];

/** One audited endpoint result: its HTTP status and whether the payload looked usable. */
interface EndpointResult {
  endpoint: string;
  status: number | "error";
  usable: boolean;
  note?: string;
}

async function probe(url: string, isUsable: (body: unknown) => boolean): Promise<{ status: number | "error"; usable: boolean; note?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { status: response.status, usable: false };
    }
    const body = await response.json();
    const usable = isUsable(body);
    return { status: response.status, usable, note: usable ? undefined : "200 but empty/unusable payload" };
  } catch (error) {
    return { status: "error", usable: false, note: error instanceof Error ? error.message : "unknown error" };
  }
}

function hasArray(body: unknown, path: string[]): boolean {
  let node: unknown = body;
  for (const key of path) {
    if (node == null || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[key];
  }
  return Array.isArray(node) && node.length > 0;
}

async function firstTeamId(leaguePath: string): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_API_BASE}/${leaguePath}/teams?limit=999`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      sports?: Array<{ leagues?: Array<{ teams?: Array<{ team?: { id?: string } }> }> }>;
    };
    return data.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team?.id ?? null;
  } catch {
    return null;
  }
}

async function firstAthleteId(leaguePath: string, teamId: string): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_API_BASE}/${leaguePath}/teams/${teamId}/roster`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      athletes?: Array<{ id?: string; items?: Array<{ id?: string }> }>;
    };
    const flat = Array.isArray(data.athletes) ? data.athletes : [];
    const direct = flat.find((entry) => entry.id);
    const nested = flat.flatMap((group) => group.items ?? [])[0];
    return direct?.id ?? nested?.id ?? null;
  } catch {
    return null;
  }
}

async function firstEventId(leaguePath: string): Promise<string | null> {
  try {
    const response = await fetch(`${SITE_API_BASE}/${leaguePath}/scoreboard`);
    if (!response.ok) return null;
    const data = (await response.json()) as { events?: Array<{ id?: string }> };
    return data.events?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function auditLeague(league: LeagueTarget): Promise<EndpointResult[]> {
  const results: EndpointResult[] = [];
  const path = league.path;

  const scoreboard = await probe(`${SITE_API_BASE}/${path}/scoreboard`, (b) => hasArray(b, ["events"]));
  results.push({ endpoint: "scoreboard", ...scoreboard });

  const teams = await probe(`${SITE_API_BASE}/${path}/teams?limit=999`, (b) => hasArray(b, ["sports", "0", "leagues", "0", "teams"] as unknown as string[]));
  results.push({ endpoint: "teams", ...teams });

  const standingsSite = await probe(`${SITE_API_BASE}/${path}/standings`, (b) => hasArray(b, ["children"]));
  results.push({ endpoint: "standings (site v2)", ...standingsSite });

  const standingsV2 = await probe(`${V2_API_BASE}/${path}/standings`, (b) => hasArray(b, ["children"]) || typeof b === "object");
  results.push({ endpoint: "standings (apis/v2)", ...standingsV2 });

  const teamId = await firstTeamId(path);
  if (teamId) {
    const roster = await probe(`${SITE_API_BASE}/${path}/teams/${teamId}/roster`, (b) => hasArray(b, ["athletes"]));
    results.push({ endpoint: "team roster", ...roster });

    const schedule = await probe(`${SITE_API_BASE}/${path}/teams/${teamId}/schedule`, (b) => hasArray(b, ["events"]));
    results.push({ endpoint: "team schedule", ...schedule });

    const injuries = await probe(`${SITE_API_BASE}/${path}/teams/${teamId}/injuries`, (b) => typeof b === "object" && b !== null);
    results.push({ endpoint: "team injuries", ...injuries });

    const athleteId = await firstAthleteId(path, teamId);
    if (athleteId) {
      const gamelog = await probe(`${SITE_WEB_API_BASE}/${path}/athletes/${athleteId}/gamelog`, (b) => hasArray(b, ["names"]) || typeof b === "object");
      results.push({ endpoint: "athlete gamelog", ...gamelog });

      const stats = await probe(`${SITE_API_BASE}/${path}/athletes/${athleteId}/stats`, (b) => typeof b === "object" && b !== null);
      results.push({ endpoint: "athlete stats", ...stats });
    } else {
      results.push({ endpoint: "athlete gamelog", status: "error", usable: false, note: "no athlete id discovered" });
      results.push({ endpoint: "athlete stats", status: "error", usable: false, note: "no athlete id discovered" });
    }
  } else {
    for (const endpoint of ["team roster", "team schedule", "team injuries", "athlete gamelog", "athlete stats"]) {
      results.push({ endpoint, status: "error", usable: false, note: "no team id discovered" });
    }
  }

  const transactions = await probe(`${SITE_API_BASE}/${path}/transactions`, (b) => typeof b === "object" && b !== null);
  results.push({ endpoint: "transactions", ...transactions });

  const eventId = await firstEventId(path);
  if (eventId) {
    const odds = await probe(`${CORE_API_BASE}/${path}/events/${eventId}/competitions/${eventId}/odds`, (b) => typeof b === "object" && b !== null);
    results.push({ endpoint: "event odds", ...odds });

    const summary = await probe(`${SITE_API_BASE}/${path}/summary?event=${eventId}`, (b) => typeof b === "object" && b !== null);
    results.push({ endpoint: "event summary", ...summary });
  } else {
    results.push({ endpoint: "event odds", status: "error", usable: false, note: "no event id discovered (likely off-season)" });
    results.push({ endpoint: "event summary", status: "error", usable: false, note: "no event id discovered (likely off-season)" });
  }

  if (league.hasLeaderboard) {
    const leaderboard = await probe(`${SITE_API_BASE}/${path}/scoreboard`, (b) => hasArray(b, ["events"]));
    results.push({ endpoint: "leaderboard", ...leaderboard });
  }

  return results;
}

function statusCell(result: EndpointResult): string {
  const ok = result.usable ? "✅" : "❌";
  return `${ok} ${result.status}${result.note ? ` (${result.note})` : ""}`;
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "# ESPN endpoint availability audit",
    "",
    `Generated ${date} by \`scripts/audit-espn-endpoints.ts\`. Re-run to refresh.`,
    "",
    "Legend: ✅ usable, ❌ not usable (404/500/empty/error). One sample team and athlete id is discovered per league via the teams/roster endpoints, so a ❌ on a team- or athlete-scoped endpoint reflects that specific sample, not necessarily every team.",
    "",
  ];

  for (const league of LEAGUES) {
    console.error(`Auditing ${league.key}...`);
    const results = await auditLeague(league);
    lines.push(`## ${league.key}`, "", "| Endpoint | Result |", "|---|---|");
    for (const result of results) {
      lines.push(`| ${result.endpoint} | ${statusCell(result)} |`);
    }
    lines.push("");
  }

  const fs = await import("node:fs/promises");
  await fs.writeFile("docs/espn-endpoint-audit.md", lines.join("\n"));
  console.error("Wrote docs/espn-endpoint-audit.md");
}

main();

/**
 * Re-shapes the audit into the `espnFeatureSources` booleans consumed by a
 * `LeagueDefinition` in src/lib/leagues/registry.ts. Exported for reuse by
 * that registry work; not invoked by `main()` since it needs the raw
 * per-league results, not the markdown they're rendered into.
 */
export function toFeatureSources(results: EndpointResult[]): {
  injuries: boolean;
  roster: boolean;
  schedule: boolean;
  gamelog: boolean;
  transactions: boolean;
} {
  const usable = (endpoint: string) => results.find((r) => r.endpoint === endpoint)?.usable ?? false;
  return {
    injuries: usable("team injuries"),
    roster: usable("team roster"),
    schedule: usable("team schedule"),
    gamelog: usable("athlete gamelog"),
    transactions: usable("transactions"),
  };
}

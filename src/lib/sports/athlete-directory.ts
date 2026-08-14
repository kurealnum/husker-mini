/**
 * Athlete-sport equivalent of `team-directory.ts`. Tennis (and other
 * athlete sports) has no `teams` endpoint worth resolving against — ESPN's
 * tennis "teams" endpoint returns tour sections, not competitors, and the
 * full athlete list (`sports.core.api.espn.com/.../athletes`) is 18,000+
 * `$ref`-only entries across 3,600+ pages, useless for name resolution at
 * request time.
 *
 * The site API's rankings endpoint doubles as a directory: it returns the
 * current top ~150 ranked players by name and id in one request — plenty
 * to resolve almost any active tour match, and it's the same data the
 * win-probability model's ranking feature needs anyway. A player ranked
 * below ~150 (or unranked) won't resolve; that's an accepted limitation,
 * not a silent wrong answer — `resolveAthletesStage` fails loudly rather
 * than guessing when a name isn't found.
 */
import { espnLeaguePath } from "@/lib/leagues/registry";

export interface AthleteInfo {
  /** ESPN's athlete id. */
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  /** Current ATP/WTA ranking (1 = best). */
  rank: number;
}

interface EspnRankingsResponse {
  rankings: Array<{
    ranks: Array<{
      current: number;
      athlete: { id: string; firstName: string; lastName: string; displayName: string };
    }>;
  }>;
}

/** Fetches the current top-ranked players for a tour (atp/wta), used both to resolve match participants and as the ranking feature. */
export async function fetchAthleteDirectory(league: string, baseUrl: string): Promise<AthleteInfo[]> {
  const response = await fetch(`${baseUrl}/${espnLeaguePath(league)}/rankings`);
  if (!response.ok) {
    throw new Error(`ESPN rankings request failed (${response.status}).`);
  }

  const data = (await response.json()) as EspnRankingsResponse;
  const ranks = data.rankings?.[0]?.ranks ?? [];

  return ranks.map((r) => ({
    id: r.athlete.id,
    displayName: r.athlete.displayName,
    firstName: r.athlete.firstName,
    lastName: r.athlete.lastName,
    rank: r.current,
  }));
}

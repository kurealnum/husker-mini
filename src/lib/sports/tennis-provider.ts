import { espnLeaguePath } from "@/lib/leagues/registry";

import type { Contest, FindGameParams, SportsGameStatus, SportsProvider } from "./provider";

interface EspnLinescore {
  value: number;
  winner?: boolean;
}

interface EspnCompetitor {
  id: string;
  homeAway: "home" | "away";
  winner?: boolean;
  athlete?: { displayName: string };
  linescores?: EspnLinescore[];
}

interface EspnCompetition {
  id: string;
  date: string;
  status: { period?: number; type: { completed: boolean; state: string } };
  competitors: EspnCompetitor[];
}

interface EspnGrouping {
  competitions: EspnCompetition[];
}

interface EspnEvent {
  major?: boolean;
  groupings?: EspnGrouping[];
}

interface EspnScoreboardResponse {
  events: EspnEvent[];
}

function matchesAthlete(name: string, competitor: EspnCompetitor): boolean {
  // Doubles pairs and TBD qualifier slots carry no `athlete` at all —
  // never a match, not an error.
  if (!competitor.athlete?.displayName) return false;
  const needle = name.trim().toLowerCase();
  const displayName = competitor.athlete.displayName.toLowerCase();
  return displayName === needle || displayName.includes(needle) || needle.includes(displayName);
}

function toStatus(state: string): SportsGameStatus {
  if (state === "pre") return "scheduled";
  if (state === "post") return "final";
  return "in_progress";
}

/**
 * Approximates match progress from sets played rather than a clock — ESPN's
 * tennis competitions expose per-set `linescores`, not a running clock the
 * way clocked sports do. `expectedSets` is the statistical expectation of
 * how many sets a match of this format actually takes (not the maximum
 * possible), so a completed 2-set sweep still reads close to 1 rather than
 * a 3-set match reading as "only 67% done" when it's actually over.
 */
function computeSetsProgress(setsPlayed: number, isMajorForAtp: boolean): number {
  const expectedSets = isMajorForAtp ? 3.6 : 2.3;
  return Math.min(1, setsPlayed / expectedSets);
}

/** ESPN's tennis scoreboard — no API key required. Nested one level deeper than team sports: events -> groupings (singles/doubles) -> competitions (individual matches). */
export class TennisSportsProvider implements SportsProvider {
  constructor(private readonly baseUrl: string) {}

  async findGame({ league, team1, team2 }: FindGameParams): Promise<Contest | null> {
    const path = espnLeaguePath(league);

    const response = await fetch(`${this.baseUrl}/${path}/scoreboard`);
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed (${response.status}).`);
    }

    const data = (await response.json()) as EspnScoreboardResponse;

    for (const event of data.events) {
      for (const grouping of event.groupings ?? []) {
        for (const competition of grouping.competitions) {
          const competitors = competition.competitors ?? [];
          const home = competitors.find((c) => matchesAthlete(team1, c) || matchesAthlete(team2, c));
          const away = competitors.find(
            (c) => c !== home && (matchesAthlete(team1, c) || matchesAthlete(team2, c)),
          );
          if (!home?.athlete || !away?.athlete) continue;

          const [first, second] = matchesAthlete(team1, home) ? [home, away] : [away, home];
          const firstAthlete = first.athlete!;
          const secondAthlete = second.athlete!;
          const setsWon = (c: EspnCompetitor) => (c.linescores ?? []).filter((l) => l.winner).length;
          const setsPlayed = Math.max((home.linescores ?? []).length, (away.linescores ?? []).length);
          const isMajorForAtp = league === "atp" && event.major === true;

          return {
            competitors: [
              {
                id: first.id,
                name: firstAthlete.displayName,
                abbreviation: firstAthlete.displayName,
                score: setsWon(first),
                isHome: first.homeAway === "home",
              },
              {
                id: second.id,
                name: secondAthlete.displayName,
                abbreviation: secondAthlete.displayName,
                score: setsWon(second),
                isHome: second.homeAway === "home",
              },
            ],
            status: toStatus(competition.status.type.state),
            gameProgress:
              competition.status.type.state === "pre"
                ? 0
                : competition.status.type.completed
                  ? 1
                  : computeSetsProgress(setsPlayed, isMajorForAtp),
            gameDate: competition.date,
            espnEventId: competition.id,
          };
        }
      }
    }

    return null;
  }
}

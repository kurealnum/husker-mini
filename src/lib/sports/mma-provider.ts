import { espnLeaguePath } from "@/lib/leagues/registry";

import type { Contest, FindGameParams, SportsGameStatus, SportsProvider } from "./provider";

interface EspnRecord {
  type: string;
  summary: string;
}

interface EspnCompetitor {
  id: string;
  winner?: boolean;
  athlete?: { displayName: string };
  records?: EspnRecord[];
}

interface EspnCompetition {
  id: string;
  date: string;
  format?: { regulation?: { periods?: number } };
  status: {
    period?: number;
    displayClock?: string;
    type: { completed: boolean; state: string };
  };
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  competitions: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events: EspnEvent[];
}

function matchesFighter(name: string, competitor: EspnCompetitor): boolean {
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

/** Standard (non-championship) UFC bouts are 3 rounds; title fights are 5 — read per fight from `format.regulation.periods`, never assumed. */
const DEFAULT_ROUNDS = 3;
const ROUND_SECONDS = 300;

/**
 * Approximates fight progress from round number — MMA has no running
 * score, so unlike clocked team sports there's nothing informative to
 * derive from score differential (`technicalWeight` is configured to 0
 * for MMA; see `docs/pipelines/mma.md`). Progress is still tracked for
 * completeness and to record the round a finish happened in.
 */
function computeRoundProgress(status: EspnCompetition["status"], totalRounds: number): number {
  if (status.type.state === "pre") return 0;
  if (status.type.completed) return 1;

  const period = status.period ?? 1;
  const [minutes, seconds] = (status.displayClock ?? "5:00").split(":").map(Number);
  const remaining = (Number.isNaN(minutes) ? 5 : minutes) * 60 + (Number.isNaN(seconds) ? 0 : seconds);
  const roundElapsed = Math.min(1, Math.max(0, 1 - remaining / ROUND_SECONDS));
  return (period - 1 + roundElapsed) / totalRounds;
}

/** ESPN's MMA scoreboard — flat `events -> competitions`, unlike tennis's nested groupings. No injury/roster/gamelog/stats/splits/plays/linescores endpoint exists for MMA (all confirmed 404); this provider only ever reads the scoreboard response itself. */
export class MmaSportsProvider implements SportsProvider {
  constructor(private readonly baseUrl: string) {}

  async findGame({ league, team1, team2 }: FindGameParams): Promise<Contest | null> {
    const path = espnLeaguePath(league);

    const response = await fetch(`${this.baseUrl}/${path}/scoreboard`);
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed (${response.status}).`);
    }

    const data = (await response.json()) as EspnScoreboardResponse;

    for (const event of data.events) {
      for (const competition of event.competitions ?? []) {
        const competitors = competition.competitors ?? [];
        const first = competitors.find((c) => matchesFighter(team1, c) || matchesFighter(team2, c));
        const second = competitors.find(
          (c) => c !== first && (matchesFighter(team1, c) || matchesFighter(team2, c)),
        );
        if (!first?.athlete || !second?.athlete) continue;

        const [fighter1, fighter2] = matchesFighter(team1, first) ? [first, second] : [second, first];
        const athlete1 = fighter1.athlete!;
        const athlete2 = fighter2.athlete!;
        const totalRounds = competition.format?.regulation?.periods ?? DEFAULT_ROUNDS;

        return {
          competitors: [
            {
              id: fighter1.id,
              name: athlete1.displayName,
              abbreviation: athlete1.displayName,
              score: fighter1.winner ? 1 : 0,
              isHome: true,
            },
            {
              id: fighter2.id,
              name: athlete2.displayName,
              abbreviation: athlete2.displayName,
              score: fighter2.winner ? 1 : 0,
              isHome: false,
            },
          ],
          status: toStatus(competition.status.type.state),
          gameProgress: computeRoundProgress(competition.status, totalRounds),
          gameDate: competition.date,
          espnEventId: competition.id,
        };
      }
    }

    return null;
  }
}

import { espnLeaguePath } from "@/lib/leagues/registry";

import type { Contest, FindGameParams, SportsGameStatus, SportsProvider } from "./provider";

interface EspnCompetitor {
  id: string;
  order?: number;
  athlete?: { displayName: string };
  score?: string;
}

interface EspnCompetition {
  id: string;
  date: string;
  status: { period?: number; type: { completed: boolean; state: string; description?: string } };
  competitors: EspnCompetitor[];
}

interface EspnEvent {
  /** Tournament-level status — authoritative for whether the whole event is over, unlike `competition.status` (per-round: "Play Complete" after round 1 alone also reports `state: "post"`). */
  status: { type: { completed: boolean; state: string } };
  competitions: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events: EspnEvent[];
}

function toStatus(state: string): SportsGameStatus {
  if (state === "pre") return "scheduled";
  if (state === "post") return "final";
  return "in_progress";
}

const TOTAL_ROUNDS = 4;

/**
 * Approximates tournament progress from round completion only (round N of
 * 4, "Play Complete" or in progress) — hole-level detail requires the
 * per-player `leaderboard/{eventId}/playersummary` endpoint the issue
 * scope names, which this provider doesn't call (documented scope
 * reduction: round-level granularity is enough to gate the minimum-history
 * floor the same way every other sport's progress does, and this field
 * model's only real feature is live strokes-behind-leader, not progress
 * itself).
 */
function computeRoundProgress(eventStatus: EspnEvent["status"], competitionStatus: EspnCompetition["status"]): number {
  if (eventStatus.type.state === "pre") return 0;
  if (eventStatus.type.completed) return 1;
  // `competitionStatus.completed` only means "this round is over," not the
  // tournament — don't shortcut to 1 from it the way the event-level check
  // above safely can.
  const period = competitionStatus.period ?? 1;
  const roundComplete = competitionStatus.type.completed;
  return Math.min(1, (roundComplete ? period : period - 0.5) / TOTAL_ROUNDS);
}

/** Parses a relative-to-par display value like "-6", "E", "+2" into a signed number (E = even par = 0). */
function parseScore(score: string | undefined): number {
  if (score == null) return 0;
  if (score === "E") return 0;
  const value = Number.parseInt(score, 10);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * ESPN's golf scoreboard — a field market provider, not head-to-head:
 * returns every player in the tournament (~70-150), not two competitors.
 * `FindGameParams.team1`/`team2` are unused; golf resolves its whole field
 * via `resolveFieldStage` before calling this, and matches on tournament
 * identity (there's only ever one active tournament event per date) rather
 * than by name.
 */
export class GolfFieldProvider implements SportsProvider {
  constructor(private readonly baseUrl: string) {}

  async findGame({ league }: FindGameParams): Promise<Contest | null> {
    const path = espnLeaguePath(league);

    const response = await fetch(`${this.baseUrl}/${path}/scoreboard`);
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed (${response.status}).`);
    }

    const data = (await response.json()) as EspnScoreboardResponse;
    const event = data.events[0];
    const competition = event?.competitions[0];
    if (!competition) return null;

    const competitors = competition.competitors.filter((c) => c.athlete?.displayName);
    if (competitors.length === 0) return null;

    return {
      competitors: competitors.map((c) => ({
        id: c.id,
        name: c.athlete!.displayName,
        abbreviation: c.athlete!.displayName,
        score: parseScore(c.score),
        isHome: false,
      })),
      // Uses the event (tournament) status, not the competition (round)
      // status — a completed round 1 alone also reports `state: "post"`,
      // which would otherwise mark the whole tournament "final" a day early.
      status: toStatus(event.status.type.state),
      gameProgress: computeRoundProgress(event.status, competition.status),
      gameDate: competition.date,
      espnEventId: competition.id,
    };
  }
}

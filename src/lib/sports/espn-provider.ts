import { espnLeaguePath, getLeague } from "@/lib/leagues/registry";

import type { Contest, FindGameParams, SportsGameStatus, SportsProvider } from "./provider";

interface EspnCompetitor {
  id: string;
  homeAway: "home" | "away";
  team: { id: string; displayName: string; abbreviation: string };
  score: string;
}

interface EspnCompetition {
  id: string;
  date: string;
  competitors: EspnCompetitor[];
  status: {
    type: { completed: boolean; state: string };
    period: number;
    displayClock: string;
    /** Cumulative elapsed match seconds — only present for count-up-clock sports (soccer). */
    clock?: number;
  };
}

interface EspnEvent {
  competitions: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events: EspnEvent[];
}

function matchesTeam(name: string, competitor: EspnCompetitor): boolean {
  const needle = name.trim().toLowerCase();
  return (
    competitor.team.displayName.toLowerCase().includes(needle) ||
    competitor.team.abbreviation.toLowerCase() === needle
  );
}

function parseClockElapsedFraction(displayClock: string, secondsPerPeriod: number): number {
  if (secondsPerPeriod <= 0) return 0;
  const [minutes, seconds] = displayClock.split(":").map(Number);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;
  const remaining = minutes * 60 + seconds;
  return Math.min(1, Math.max(0, 1 - remaining / secondsPerPeriod));
}

/**
 * Soccer's clock counts up continuously across the whole match (not reset
 * per period) and keeps counting into stoppage time — ESPN's `clock` field
 * is already cumulative elapsed seconds, so progress is simply that over
 * regulation length, naturally exceeding 1 during stoppage rather than
 * needing period/remaining-time reconstruction the way countdown-clock
 * sports do.
 */
function computeCountUpClockProgress(league: string, status: EspnCompetition["status"]): number {
  const { periods } = getLeague(league);
  const regulationSeconds = periods.count * periods.secondsPerPeriod;
  if (regulationSeconds <= 0 || status.clock == null) return 0;
  return status.clock / regulationSeconds;
}

function computeGameProgress(league: string, status: EspnCompetition["status"]): number {
  if (status.type.state === "pre") return 0;
  if (status.type.completed) return 1;

  const { periods, progressModel } = getLeague(league);
  if (progressModel === "count_up_clock") {
    return computeCountUpClockProgress(league, status);
  }

  const clockElapsed = parseClockElapsedFraction(status.displayClock, periods.secondsPerPeriod);
  return (status.period - 1 + clockElapsed) / periods.count;
}

function toStatus(state: string): SportsGameStatus {
  if (state === "pre") return "scheduled";
  if (state === "post") return "final";
  return "in_progress";
}

/** ESPN's public scoreboard API — no API key required. */
export class EspnSportsProvider implements SportsProvider {
  constructor(private readonly baseUrl: string) {}

  async findGame({ league, team1, team2 }: FindGameParams): Promise<Contest | null> {
    const path = espnLeaguePath(league);

    const response = await fetch(`${this.baseUrl}/${path}/scoreboard`);
    if (!response.ok) {
      throw new Error(`ESPN scoreboard request failed (${response.status}).`);
    }

    const data = (await response.json()) as EspnScoreboardResponse;

    for (const event of data.events) {
      const competition = event.competitions[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c) => matchesTeam(team1, c) || matchesTeam(team2, c));
      const away = competitors.find(
        (c) => c !== home && (matchesTeam(team1, c) || matchesTeam(team2, c)),
      );
      if (!home || !away) continue;

      const [first, second] = matchesTeam(team1, home) ? [home, away] : [away, home];

      return {
        competitors: [
          {
            id: first.team.id,
            name: first.team.displayName,
            abbreviation: first.team.abbreviation,
            score: Number(first.score),
            isHome: first.homeAway === "home",
          },
          {
            id: second.team.id,
            name: second.team.displayName,
            abbreviation: second.team.abbreviation,
            score: Number(second.score),
            isHome: second.homeAway === "home",
          },
        ],
        status: toStatus(competition.status.type.state),
        gameProgress: computeGameProgress(league, competition.status),
        gameDate: competition.date,
        espnEventId: competition.id,
      };
    }

    return null;
  }
}

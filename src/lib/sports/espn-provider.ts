import type { FindGameParams, SportsGame, SportsGameStatus, SportsProvider } from "./provider";

/** ESPN scoreboard path per sport key, e.g. "nfl" -> "football/nfl". */
export const ESPN_SPORT_PATHS: Record<string, string> = {
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  mlb: "baseball/mlb",
  ncaaf: "football/college-football",
  ncaab: "basketball/mens-college-basketball",
};

/** Regulation period length and count, used to estimate game-clock progress. */
const SPORT_PERIODS: Record<string, { count: number; secondsPerPeriod: number }> = {
  nfl: { count: 4, secondsPerPeriod: 15 * 60 },
  nba: { count: 4, secondsPerPeriod: 12 * 60 },
  nhl: { count: 3, secondsPerPeriod: 20 * 60 },
  mlb: { count: 9, secondsPerPeriod: 0 },
  ncaaf: { count: 4, secondsPerPeriod: 15 * 60 },
  ncaab: { count: 2, secondsPerPeriod: 20 * 60 },
};

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

function computeGameProgress(
  sport: string,
  status: EspnCompetition["status"],
): number {
  if (status.type.state === "pre") return 0;
  if (status.type.completed) return 1;

  const periods = SPORT_PERIODS[sport] ?? { count: 4, secondsPerPeriod: 15 * 60 };
  const clockElapsed = parseClockElapsedFraction(status.displayClock, periods.secondsPerPeriod);
  return ((status.period - 1) + clockElapsed) / periods.count;
}

function toStatus(state: string): SportsGameStatus {
  if (state === "pre") return "scheduled";
  if (state === "post") return "final";
  return "in_progress";
}

/** ESPN's public scoreboard API — no API key required. */
export class EspnSportsProvider implements SportsProvider {
  constructor(private readonly baseUrl: string) {}

  async findGame({ sport, team1, team2 }: FindGameParams): Promise<SportsGame | null> {
    const path = ESPN_SPORT_PATHS[sport];
    if (!path) {
      throw new Error(`Unsupported sport for ESPN provider: ${sport}`);
    }

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
        team1: {
          id: first.team.id,
          name: first.team.displayName,
          abbreviation: first.team.abbreviation,
          score: Number(first.score),
          isHome: first.homeAway === "home",
        },
        team2: {
          id: second.team.id,
          name: second.team.displayName,
          abbreviation: second.team.abbreviation,
          score: Number(second.score),
          isHome: second.homeAway === "home",
        },
        status: toStatus(competition.status.type.state),
        gameProgress: computeGameProgress(sport, competition.status),
        gameDate: competition.date,
        espnEventId: competition.id,
      };
    }

    return null;
  }
}

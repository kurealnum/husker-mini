/**
 * Team strength metrics derived from ESPN standings + schedule data.
 * All access to ESPN goes through `@/lib/espn` — this module never fetches directly.
 */
import { getTeamSchedule, getTeamRecord } from "@/lib/espn";
import type { EspnCompetitor, EspnScheduleEvent } from "@/lib/espn";

export interface CompletedGame {
  opponentId: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  date: string;
}

export interface TeamStrength {
  winRate: number;
  recentWinRate: number;
  scoringDifferential: number;
  opponentAdjustedStrength: number;
  homeWinRate: number | null;
  awayWinRate: number | null;
}

function findTeamCompetitor(event: EspnScheduleEvent, teamId: string): EspnCompetitor | undefined {
  return event.competitions[0]?.competitors.find((c) => c.team.id === teamId);
}

/** Extracts completed games for a team from a schedule response, in chronological order. */
export function extractCompletedGames(
  schedule: { events: EspnScheduleEvent[] },
  teamId: string,
): CompletedGame[] {
  const games: CompletedGame[] = [];

  for (const event of schedule.events) {
    const competition = event.competitions[0];
    if (!competition || !competition.status.type.completed) continue;

    const self = findTeamCompetitor(event, teamId);
    const opponent = competition.competitors.find((c) => c.team.id !== teamId);
    if (!self || !opponent) continue;

    const teamScore = Number(self.score);
    const opponentScore = Number(opponent.score);
    if (Number.isNaN(teamScore) || Number.isNaN(opponentScore)) continue;

    games.push({
      opponentId: opponent.team.id,
      isHome: self.homeAway === "home",
      teamScore,
      opponentScore,
      won: teamScore > opponentScore,
      date: event.date,
    });
  }

  return games;
}

function winRate(games: CompletedGame[]): number {
  if (games.length === 0) return 0;
  return games.filter((g) => g.won).length / games.length;
}

/** Win rate over the most recent `windowSize` games (default 5). */
export function recentWinRate(games: CompletedGame[], windowSize = 5): number {
  const recent = games.slice(-windowSize);
  return winRate(recent);
}

/** Average (points/goals for) minus (points/goals against) across games. */
export function scoringDifferential(games: CompletedGame[]): number {
  if (games.length === 0) return 0;
  const total = games.reduce((sum, g) => sum + (g.teamScore - g.opponentScore), 0);
  return total / games.length;
}

/** Win rate restricted to home or away games; null when no games of that split exist. */
export function homeAwayWinRate(games: CompletedGame[], isHome: boolean): number | null {
  const split = games.filter((g) => g.isHome === isHome);
  if (split.length === 0) return null;
  return winRate(split);
}

/**
 * SRS-style opponent-adjusted strength: average scoring differential, adjusted
 * by the average scoring differential of opponents faced. A simple one-pass
 * approximation (not the fully iterative SRS) — sufficient as a relative signal.
 */
export function opponentAdjustedStrength(
  games: CompletedGame[],
  opponentDifferentials: Map<string, number>,
): number {
  if (games.length === 0) return 0;
  const rawDifferential = scoringDifferential(games);
  const opponentStrengths = games.map((g) => opponentDifferentials.get(g.opponentId) ?? 0);
  const avgOpponentStrength =
    opponentStrengths.reduce((sum, v) => sum + v, 0) / opponentStrengths.length;
  return rawDifferential + avgOpponentStrength;
}

/**
 * Computes full team strength metrics for a team. `allTeamGames` maps every
 * league team's completed games (by team id) so opponent-adjusted strength
 * can be computed without refetching per-opponent schedules.
 */
export function computeTeamStrength(
  teamId: string,
  allTeamGames: Map<string, CompletedGame[]>,
): TeamStrength {
  const games = allTeamGames.get(teamId) ?? [];

  const opponentDifferentials = new Map<string, number>();
  for (const [id, teamGames] of allTeamGames) {
    opponentDifferentials.set(id, scoringDifferential(teamGames));
  }

  return {
    winRate: winRate(games),
    recentWinRate: recentWinRate(games),
    scoringDifferential: scoringDifferential(games),
    opponentAdjustedStrength: opponentAdjustedStrength(games, opponentDifferentials),
    homeWinRate: homeAwayWinRate(games, true),
    awayWinRate: homeAwayWinRate(games, false),
  };
}

/** Fetches a team's schedule via the ESPN wrapper and extracts its completed games. */
export async function fetchCompletedGames(
  sport: string,
  teamId: string,
): Promise<CompletedGame[]> {
  const schedule = await getTeamSchedule(sport, teamId);
  return extractCompletedGames(schedule, teamId);
}

/** Convenience: fetch a team's raw standings entry (record, PF/PA, etc.) via the wrapper. */
export async function fetchTeamRecord(sport: string, teamId: string) {
  return getTeamRecord(sport, teamId);
}

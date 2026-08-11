/**
 * Contextual game metrics not tied to team/player performance directly:
 * home/away, rest days, season stage, and nearby roster transactions.
 */
import type { EspnTransaction } from "@/lib/espn";
import type { CompletedGame } from "./team-strength";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type HomeAwayFlag = "home" | "away";

export function homeAwayFlag(isHome: boolean): HomeAwayFlag {
  return isHome ? "home" : "away";
}

/**
 * Days between a team's most recent completed game before `gameDate` and
 * `gameDate` itself. Returns null if the team has no prior completed game.
 */
export function restDays(games: CompletedGame[], gameDate: string): number | null {
  const target = new Date(gameDate).getTime();

  let mostRecent: number | null = null;
  for (const g of games) {
    const played = new Date(g.date).getTime();
    if (played < target && (mostRecent === null || played > mostRecent)) {
      mostRecent = played;
    }
  }

  if (mostRecent === null) return null;
  return Math.round((target - mostRecent) / MS_PER_DAY);
}

export type SeasonStage = "early" | "mid" | "late" | "playoffs";

/**
 * Classifies a game's point in the season given the regular season's
 * start/end dates and an optional playoff start date. Splits the regular
 * season into three equal thirds for early/mid/late.
 */
export function classifySeasonStage(
  gameDate: string,
  seasonStartDate: string,
  seasonEndDate: string,
  playoffStartDate?: string,
): SeasonStage {
  const game = new Date(gameDate).getTime();

  if (playoffStartDate && game >= new Date(playoffStartDate).getTime()) {
    return "playoffs";
  }

  const start = new Date(seasonStartDate).getTime();
  const end = new Date(seasonEndDate).getTime();
  const span = end - start;
  if (span <= 0) return "early";

  const fraction = Math.min(1, Math.max(0, (game - start) / span));
  if (fraction < 1 / 3) return "early";
  if (fraction < 2 / 3) return "mid";
  return "late";
}

/**
 * League transactions involving a team within `windowDays` before
 * `gameDate` — recent roster moves that could affect lineup availability.
 */
export function recentTeamTransactions(
  transactions: EspnTransaction[],
  teamId: string,
  gameDate: string,
  windowDays = 14,
): EspnTransaction[] {
  const target = new Date(gameDate).getTime();
  const windowStart = target - windowDays * MS_PER_DAY;

  return transactions.filter((t) => {
    if (t.team?.id !== teamId) return false;
    const date = new Date(t.date).getTime();
    return date >= windowStart && date <= target;
  });
}

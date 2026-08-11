/**
 * Recent-form metrics derived from a team's completed-game log.
 * Consumes `CompletedGame` from `@/lib/analytics/team-strength` rather than
 * touching ESPN data directly.
 */
import type { CompletedGame } from "./team-strength";

export interface FormSummary {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScoringMargin: number;
}

export interface RecentForm {
  last5: FormSummary;
  last10: FormSummary;
  /** Slope of scoring margin over the recent window (positive = trending up). */
  scoringTrend: number;
  /** Std deviation of scoring margin over the recent window (higher = more volatile). */
  volatility: number;
}

function summarize(games: CompletedGame[]): FormSummary {
  const wins = games.filter((g) => g.won).length;
  const losses = games.length - wins;
  const margins = games.map((g) => g.teamScore - g.opponentScore);
  const avgScoringMargin = margins.length > 0 ? mean(margins) : 0;

  return {
    gamesPlayed: games.length,
    wins,
    losses,
    winRate: games.length > 0 ? wins / games.length : 0,
    avgScoringMargin,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Least-squares slope of scoring margin against game index (0, 1, 2, ...). */
function scoringTrendSlope(games: CompletedGame[]): number {
  const n = games.length;
  if (n < 2) return 0;

  const margins = games.map((g) => g.teamScore - g.opponentScore);
  const xs = margins.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(margins);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - xMean) * (margins[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/** Population standard deviation of scoring margin. */
function scoringVolatility(games: CompletedGame[]): number {
  if (games.length === 0) return 0;
  const margins = games.map((g) => g.teamScore - g.opponentScore);
  const avg = mean(margins);
  const variance = mean(margins.map((m) => (m - avg) ** 2));
  return Math.sqrt(variance);
}

/**
 * Computes recent-form metrics from a team's full completed-game log
 * (chronological order, oldest first).
 */
export function computeRecentForm(games: CompletedGame[]): RecentForm {
  const last5Games = games.slice(-5);
  const last10Games = games.slice(-10);

  return {
    last5: summarize(last5Games),
    last10: summarize(last10Games),
    scoringTrend: scoringTrendSlope(last10Games),
    volatility: scoringVolatility(last10Games),
  };
}

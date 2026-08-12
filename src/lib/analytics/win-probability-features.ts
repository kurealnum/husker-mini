/**
 * Derives `WinProbabilityFeatures` for the ESPN win-probability model from
 * data this app already assembles in `assemble-features`.
 *
 * The model spec calls for a true iterative Elo rating (K=8, 24-point home
 * bonus) and season save%/OPS/ERA plus a trailing-10-game batter rating. This
 * app has no persistent per-team Elo store and no MLB-specific save%/OPS/ERA
 * feed wired through the ESPN wrapper (see `src/lib/espn/queries.ts` — only
 * roster/gamelog/standings/schedule/odds are exposed). Per the model spec's
 * own "known limits" section, a calling system that draws stats from a
 * different source must adapt the inputs rather than block on an exact
 * match, so this module substitutes the closest signal already computed
 * elsewhere in this pipeline:
 *   - eloDiff        -> opponent-adjusted strength differential (SRS-style,
 *                        see `team-strength.ts`), the closest existing
 *                        relative-strength signal to an Elo rating.
 *   - batterRatingDiff -> trailing player-strength aggregate differential
 *                        (`player-strength.ts`, already windowed to recent
 *                        form for the sport's production stat).
 *   - savePctDiff / opsDiff / eraDiff -> no equivalent source exists yet, so
 *                        these default to 0 (no signal) rather than being
 *                        guessed. Wiring a real MLB stats feed is a
 *                        deliberate follow-up, not handled here.
 */
import type { CompletedGame } from "./team-strength";
import type { TeamFeatures } from "@/pipeline/assemble-features";
import { MIN_GAMES_HISTORY } from "@/lib/win-probability-model";
import type { WinProbabilityFeatures } from "@/lib/win-probability-model";

export interface WinProbabilityFeatureResult {
  features: WinProbabilityFeatures;
  /** False when either team has fewer than `MIN_GAMES_HISTORY` completed games this season. */
  hasSufficientHistory: boolean;
}

/** Builds win-probability model inputs for a home/away matchup. */
export function deriveWinProbabilityFeatures(
  homeGames: CompletedGame[],
  homeFeatures: TeamFeatures,
  awayGames: CompletedGame[],
  awayFeatures: TeamFeatures,
): WinProbabilityFeatureResult {
  const hasSufficientHistory =
    homeGames.length >= MIN_GAMES_HISTORY && awayGames.length >= MIN_GAMES_HISTORY;

  const eloDiff =
    homeFeatures.strength.opponentAdjustedStrength - awayFeatures.strength.opponentAdjustedStrength;
  const batterRatingDiff =
    homeFeatures.playerStrength.aggregate.average - awayFeatures.playerStrength.aggregate.average;

  return {
    features: {
      eloDiff,
      savePctDiff: 0,
      opsDiff: 0,
      eraDiff: 0,
      batterRatingDiff,
    },
    hasSufficientHistory,
  };
}

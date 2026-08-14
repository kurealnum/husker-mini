import type { KalshiMarket } from "@/lib/kalshi/client";

import { completeStage, failStage, startStage } from "./stages";

export class AmbiguousFighterResolutionError extends Error {}

export interface ResolvedFighters {
  fighter1: string;
  fighter2: string;
}

/**
 * MMA has no league-level athlete-list or rankings endpoint worth
 * resolving against (see `docs/pipelines/mma.md` for the confirmed 404
 * list), so unlike `resolveTeamsStage`/`resolveAthletesStage` this never
 * calls ESPN at all: Kalshi's own `yes_sub_title` is already each
 * fighter's full name (confirmed against live UFC markets, e.g.
 * `"Charles Johnson"`, not an abbreviation), so the two market legs'
 * `yes_sub_title` values are the resolved names directly.
 */
export async function resolveFightersStage(
  predictionId: string,
  markets: KalshiMarket[],
): Promise<ResolvedFighters> {
  const stageId = await startStage(predictionId, "resolve_fighters");

  try {
    const names = markets.map((m) => m.yes_sub_title).filter((n): n is string => !!n?.trim());
    const distinct = [...new Set(names)];

    if (distinct.length !== 2) {
      const tickers = markets.map((m) => m.ticker).join(", ");
      throw new AmbiguousFighterResolutionError(
        `Expected exactly 2 fighter names across markets [${tickers}], found ${distinct.length}: ${distinct.join(", ")}`,
      );
    }

    const resolved: ResolvedFighters = { fighter1: distinct[0], fighter2: distinct[1] };
    await completeStage(stageId, "Fighters resolved.", { ...resolved });
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failStage(stageId, message);
    throw error;
  }
}

import type { LeagueDefinition } from "@/lib/leagues/registry";
import type { Prediction } from "@/database/schemas";

/**
 * Contract every sport pipeline implements. `runPrediction` (run-prediction.ts)
 * resolves the league from the ticker, looks up the registered pipeline for it,
 * and calls `run` — it knows nothing sport-specific beyond that dispatch.
 *
 * Every pipeline implementation must document its stage graph with the
 * mermaid template in `docs/pipeline-mermaid-template.md`.
 */
export interface SportPipeline {
  run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void>;
}

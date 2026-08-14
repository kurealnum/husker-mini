import type { LeagueDefinition } from "@/lib/leagues/registry";
import type { Prediction } from "@/database/schemas";

/** One tunable config field a pipeline's model phases read, for driving the config UI's field list. */
export interface ConfigFieldDef {
  /** Property name on `PredictionConfigVersion`/`NewPredictionConfigVersion`. */
  key: string;
  label: string;
  type: "number" | "text";
}

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
  /**
   * Declares which per-phase tunable config fields this pipeline reads
   * (beyond the three blend weights and edge threshold, which every
   * pipeline uses). Drives the config form's field list, so a pipeline
   * with no technical-formula phase (e.g. a field/outright pipeline)
   * doesn't show a `technicalK` input.
   */
  configFields: ConfigFieldDef[];
}

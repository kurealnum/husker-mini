/** Configurable model parameters for the prediction pipeline, read from environment variables. */
export interface PredictionConfig {
  /** Steepness constant `k` for the technical scoring formula. */
  technicalK: number;
  /** Weight given to the technical analysis probability in the combiner. */
  technicalWeight: number;
  /** Weight given to the sentiment analysis probability in the combiner. */
  sentimentWeight: number;
  /** Minimum net edge required to place a trade; below this, `no_bet`. */
  edgeThreshold: number;
  /** Hugging Face model id used for sentiment scoring. */
  sentimentModel: string;
  /** Claude model id used to combine technical and sentiment analyses. */
  combinerModel: string;
}

/** Raised when one or more required prediction config values are missing or invalid. */
export class InvalidPredictionConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid prediction configuration:\n- ${problems.join("\n- ")}`);
    this.name = "InvalidPredictionConfigError";
  }
}

function readNumber(problems: string[], envVar: string): number {
  const raw = process.env[envVar];
  const value = Number(raw);
  if (raw == null || raw === "" || !Number.isFinite(value)) {
    problems.push(`${envVar} must be set to a finite number (got ${JSON.stringify(raw)}).`);
  }
  return value;
}

function readString(problems: string[], envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    problems.push(`${envVar} must be set.`);
  }
  return value ?? "";
}

/**
 * Reads every configurable prediction model parameter from the environment.
 * This is the single place these parameters are read from process.env —
 * every pipeline stage and the version-metadata snapshot should go through
 * this instead of reading `process.env` directly, so the set of tunable
 * parameters stays in one place, separate from the pipeline logic itself.
 *
 * Throws `InvalidPredictionConfigError` listing every missing/invalid value
 * at once, rather than failing on the first one a pipeline stage happens to
 * touch. Call this at process startup (not just per-prediction) so
 * misconfiguration is caught immediately instead of on the first job.
 */
export function getPredictionConfig(): PredictionConfig {
  const problems: string[] = [];

  const config: PredictionConfig = {
    technicalK: readNumber(problems, "PREDICTION_TECHNICAL_K"),
    technicalWeight: readNumber(problems, "PREDICTION_TECHNICAL_WEIGHT"),
    sentimentWeight: readNumber(problems, "PREDICTION_SENTIMENT_WEIGHT"),
    edgeThreshold: readNumber(problems, "PREDICTION_EDGE_THRESHOLD"),
    sentimentModel: readString(problems, "PREDICTION_SENTIMENT_MODEL"),
    combinerModel: readString(problems, "CLAUDE_COMBINER_MODEL"),
  };

  if (problems.length > 0) {
    throw new InvalidPredictionConfigError(problems);
  }

  return config;
}

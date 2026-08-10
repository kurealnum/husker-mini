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

/**
 * Reads every configurable prediction model parameter from the environment.
 * This is the single place these parameters are read from process.env —
 * every pipeline stage and the version-metadata snapshot should go through
 * this instead of reading `process.env` directly, so the set of tunable
 * parameters stays in one place, separate from the pipeline logic itself.
 */
export function getPredictionConfig(): PredictionConfig {
  return {
    technicalK: Number(process.env.PREDICTION_TECHNICAL_K),
    technicalWeight: Number(process.env.PREDICTION_TECHNICAL_WEIGHT),
    sentimentWeight: Number(process.env.PREDICTION_SENTIMENT_WEIGHT),
    edgeThreshold: Number(process.env.PREDICTION_EDGE_THRESHOLD),
    sentimentModel: process.env.PREDICTION_SENTIMENT_MODEL ?? "",
    combinerModel: process.env.CLAUDE_COMBINER_MODEL ?? "",
  };
}

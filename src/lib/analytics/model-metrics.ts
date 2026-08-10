import type { Prediction } from "@/database/schemas";

/** One bucket of a calibration curve: predictions grouped by forecast probability. */
export interface CalibrationBucket {
  /** Lower bound of the bucket's probability range, e.g. 0.2 for [0.2, 0.4). */
  rangeStart: number;
  count: number;
  averagePredictedProbability: number;
  actualFrequency: number;
}

export interface ModelMetrics {
  averageModelProbability: number | null;
  averageMarketProbability: number | null;
  averageRawEdge: number | null;
  averageNetEdge: number | null;
  brierScore: number | null;
  calibration: CalibrationBucket[];
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Number of calibration buckets spanning the [0, 1] probability range. */
const CALIBRATION_BUCKET_COUNT = 5;

/**
 * Computes model-quality metrics. Brier score and calibration only use
 * predictions with a settled result (Kalshi's actual outcome) and a
 * recorded model probability for "yes" — everything else is excluded since
 * there is no ground truth to score against yet.
 */
export function calculateModelMetrics(predictions: Prediction[]): ModelMetrics {
  const modelProbabilities = predictions.map((p) => p.modelProbability).filter((v): v is number => v != null);
  const marketProbabilities = predictions.map((p) => p.marketPrice).filter((v): v is number => v != null);
  const rawEdges = predictions.map((p) => p.rawEdge).filter((v): v is number => v != null);
  const netEdges = predictions.map((p) => p.netEdge).filter((v): v is number => v != null);

  const settled = predictions.filter(
    (p): p is Prediction & { modelProbability: number; settledResult: "yes" | "no" } =>
      p.modelProbability != null && p.settledResult != null,
  );

  const brierScore =
    settled.length > 0
      ? average(
          settled.map((p) => {
            const outcome = p.settledResult === "yes" ? 1 : 0;
            return (p.modelProbability - outcome) ** 2;
          }),
        )
      : null;

  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < CALIBRATION_BUCKET_COUNT; i++) {
    const rangeStart = i / CALIBRATION_BUCKET_COUNT;
    const rangeEnd = (i + 1) / CALIBRATION_BUCKET_COUNT;
    const inBucket = settled.filter(
      (p) => p.modelProbability >= rangeStart && (p.modelProbability < rangeEnd || rangeEnd === 1),
    );
    if (inBucket.length === 0) continue;

    buckets.push({
      rangeStart,
      count: inBucket.length,
      averagePredictedProbability: average(inBucket.map((p) => p.modelProbability))!,
      actualFrequency: average(inBucket.map((p) => (p.settledResult === "yes" ? 1 : 0)))!,
    });
  }

  return {
    averageModelProbability: average(modelProbabilities),
    averageMarketProbability: average(marketProbabilities),
    averageRawEdge: average(rawEdges),
    averageNetEdge: average(netEdges),
    brierScore,
    calibration: buckets,
  };
}

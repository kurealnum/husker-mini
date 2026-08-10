import type { Prediction } from "@/database/schemas";

/**
 * Groups predictions by an arbitrary key derived from the prediction itself.
 * Predictions the key function excludes (returns `null` for) are dropped.
 *
 * This is the seam new breakdown metrics (P&L by sport, by edge range, etc.)
 * should build on: define a key function over existing prediction fields,
 * group, then run an existing metric calculator (e.g.
 * `calculatePerformanceMetrics`) over each group. No schema or prediction
 * record changes are needed to add a new breakdown this way.
 */
export function groupPredictionsBy<K extends string>(
  predictions: Prediction[],
  keyFn: (prediction: Prediction) => K | null,
): Record<K, Prediction[]> {
  const groups = {} as Record<K, Prediction[]>;

  for (const prediction of predictions) {
    const key = keyFn(prediction);
    if (key == null) continue;
    (groups[key] ??= []).push(prediction);
  }

  return groups;
}

import type { Prediction } from "@/database/schemas";

/** One point in a cumulative P&L series. */
export interface CumulativePnlPoint {
  predictionId: string;
  finishedAt: Date;
  pnlCents: number;
  cumulativePnlCents: number;
}

/**
 * Computes a running total of P&L over time, ordered by settlement time.
 * Money is summed as integer cents throughout — never as floating point.
 */
export function calculateCumulativePnl(predictions: Prediction[]): CumulativePnlPoint[] {
  const settled = predictions
    .filter((p): p is Prediction & { finishedAt: Date; pnlCents: number } => p.finishedAt != null && p.pnlCents != null)
    .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());

  let runningTotalCents = 0;
  return settled.map((p) => {
    runningTotalCents += p.pnlCents;
    return {
      predictionId: p.id,
      finishedAt: p.finishedAt,
      pnlCents: p.pnlCents,
      cumulativePnlCents: runningTotalCents,
    };
  });
}

/** Aggregate performance stats across a set of predictions. */
export interface PerformanceMetrics {
  totalPredictions: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnlCents: number;
  averageReturnPercentage: number | null;
  averagePnlCentsPerPrediction: number | null;
  averageNetEdge: number | null;
}

/**
 * Computes overall performance metrics from a list of predictions. Win/loss,
 * P&L, and return figures only consider settled trades (a recorded
 * `winLoss`); edge is averaged over every prediction that reached a decision.
 */
export function calculatePerformanceMetrics(predictions: Prediction[]): PerformanceMetrics {
  const settled = predictions.filter((p) => p.winLoss != null);
  const wins = settled.filter((p) => p.winLoss === "win").length;
  const losses = settled.filter((p) => p.winLoss === "loss").length;

  const pnlValues = settled.map((p) => p.pnlCents).filter((v): v is number => v != null);
  const totalPnlCents = pnlValues.reduce((sum, v) => sum + v, 0);

  const returnValues = settled
    .map((p) => p.returnPercentage)
    .filter((v): v is number => v != null);
  const averageReturnPercentage =
    returnValues.length > 0 ? returnValues.reduce((sum, v) => sum + v, 0) / returnValues.length : null;

  const edgeValues = predictions.map((p) => p.netEdge).filter((v): v is number => v != null);
  const averageNetEdge =
    edgeValues.length > 0 ? edgeValues.reduce((sum, v) => sum + v, 0) / edgeValues.length : null;

  return {
    totalPredictions: predictions.length,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    totalPnlCents,
    averageReturnPercentage,
    averagePnlCentsPerPrediction: pnlValues.length > 0 ? totalPnlCents / pnlValues.length : null,
    averageNetEdge,
  };
}

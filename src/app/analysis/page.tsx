import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import { calculatePerformanceMetrics } from "@/lib/analytics/performance-metrics";

function formatCents(value: number | null): string {
  return value == null ? "—" : `$${(value / 100).toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

/** Overall performance analytics for the prediction system. */
export default async function AnalysisPage() {
  const allPredictions = await db.select().from(predictions);
  const metrics = calculatePerformanceMetrics(allPredictions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total P&L" value={formatCents(metrics.totalPnlCents)} />
        <StatTile label="Average return" value={formatPercent(metrics.averageReturnPercentage)} />
        <StatTile label="Predictions" value={metrics.totalPredictions} />
        <StatTile label="Wins" value={metrics.wins} />
        <StatTile label="Losses" value={metrics.losses} />
        <StatTile label="Win rate" value={formatPercent(metrics.winRate)} />
        <StatTile label="Avg P&L / prediction" value={formatCents(metrics.averagePnlCentsPerPrediction)} />
        <StatTile label="Average edge" value={formatPercent(metrics.averageNetEdge)} />
      </div>
    </div>
  );
}

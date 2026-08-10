import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import { calculatePerformanceMetrics } from "@/lib/analytics/performance-metrics";
import { calculateModelMetrics } from "@/lib/analytics/model-metrics";

function formatCents(value: number | null): string {
  return value == null ? "—" : `$${(value / 100).toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null): string {
  return value == null ? "—" : value.toFixed(4);
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Overall performance and model-quality analytics for the prediction system. */
export default async function AnalysisPage() {
  const allPredictions = await db.select().from(predictions);
  const performance = calculatePerformanceMetrics(allPredictions);
  const model = calculateModelMetrics(allPredictions);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>

      <Section title="Performance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total P&L" value={formatCents(performance.totalPnlCents)} />
          <StatTile label="Average return" value={formatPercent(performance.averageReturnPercentage)} />
          <StatTile label="Predictions" value={performance.totalPredictions} />
          <StatTile label="Wins" value={performance.wins} />
          <StatTile label="Losses" value={performance.losses} />
          <StatTile label="Win rate" value={formatPercent(performance.winRate)} />
          <StatTile label="Avg P&L / prediction" value={formatCents(performance.averagePnlCentsPerPrediction)} />
          <StatTile label="Average edge" value={formatPercent(performance.averageNetEdge)} />
        </div>
      </Section>

      <Section title="Model quality">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Avg model probability" value={formatPercent(model.averageModelProbability)} />
          <StatTile label="Avg market probability" value={formatPercent(model.averageMarketProbability)} />
          <StatTile label="Avg raw edge" value={formatPercent(model.averageRawEdge)} />
          <StatTile label="Avg net edge" value={formatPercent(model.averageNetEdge)} />
          <StatTile label="Brier score" value={formatScore(model.brierScore)} />
        </div>

        {model.calibration.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Probability range</th>
                  <th className="px-3 py-2 font-medium">Count</th>
                  <th className="px-3 py-2 font-medium">Avg predicted</th>
                  <th className="px-3 py-2 font-medium">Actual frequency</th>
                </tr>
              </thead>
              <tbody>
                {model.calibration.map((bucket) => (
                  <tr key={bucket.rangeStart} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      {(bucket.rangeStart * 100).toFixed(0)}–{(bucket.rangeStart * 100 + 20).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2">{bucket.count}</td>
                    <td className="px-3 py-2">{formatPercent(bucket.averagePredictedProbability)}</td>
                    <td className="px-3 py-2">{formatPercent(bucket.actualFrequency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

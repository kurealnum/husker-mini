import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";
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

const STATUS_OPTIONS = ["pending", "running", "predicted", "waiting_for_result", "finished", "failed"] as const;
const DECISION_OPTIONS = ["buy_yes", "buy_no", "no_bet"] as const;
const RESULT_OPTIONS = ["yes", "no"] as const;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isOneOf<T extends string>(value: string | undefined, options: readonly T[]): value is T {
  return !!value && (options as readonly string[]).includes(value);
}

/** Overall performance and model-quality analytics for the prediction system. */
export default async function AnalysisPage({ searchParams }: PageProps<"/analysis">) {
  const params = await searchParams;
  const sport = firstParam(params.sport);
  const status = firstParam(params.status);
  const decision = firstParam(params.decision);
  const result = firstParam(params.result);
  const from = firstParam(params.from);
  const to = firstParam(params.to);

  const filters = [
    sport ? eq(predictions.sport, sport) : undefined,
    isOneOf(status, STATUS_OPTIONS) ? eq(predictions.status, status) : undefined,
    isOneOf(decision, DECISION_OPTIONS) ? eq(predictions.decision, decision) : undefined,
    isOneOf(result, RESULT_OPTIONS) ? eq(predictions.settledResult, result) : undefined,
    from ? gte(predictions.createdAt, new Date(from)) : undefined,
    to ? lte(predictions.createdAt, new Date(to)) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const filtered: Prediction[] = await db
    .select()
    .from(predictions)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(predictions.createdAt));

  const performance = calculatePerformanceMetrics(filtered);
  const model = calculateModelMetrics(filtered);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>

      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Sport
          <input
            type="text"
            name="sport"
            defaultValue={sport ?? ""}
            placeholder="e.g. nfl"
            className="rounded border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select name="status" defaultValue={status ?? ""} className="rounded border bg-background px-2 py-1">
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Decision
          <select name="decision" defaultValue={decision ?? ""} className="rounded border bg-background px-2 py-1">
            <option value="">All</option>
            {DECISION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Result
          <select name="result" defaultValue={result ?? ""} className="rounded border bg-background px-2 py-1">
            <option value="">All</option>
            {RESULT_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          From
          <input type="date" name="from" defaultValue={from ?? ""} className="rounded border bg-background px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input type="date" name="to" defaultValue={to ?? ""} className="rounded border bg-background px-2 py-1" />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-muted">
          Filter
        </button>
      </form>

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

      <Section title="History">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Sport</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">P&L</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((prediction) => (
                <tr key={prediction.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/predictions/${prediction.id}`} className="hover:underline">
                      {prediction.eventTitle ?? prediction.kalshiEventTicker}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{prediction.sport ?? "—"}</td>
                  <td className="px-3 py-2">{prediction.decision ?? "—"}</td>
                  <td className="px-3 py-2">{prediction.status}</td>
                  <td className="px-3 py-2">{prediction.settledResult ?? "—"}</td>
                  <td className="px-3 py-2">{formatCents(prediction.pnlCents)}</td>
                  <td className="px-3 py-2">{prediction.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No predictions match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

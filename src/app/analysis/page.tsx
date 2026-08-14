import Link from "next/link";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";
import {
  calculateCumulativePnl,
  calculatePerformanceMetrics,
  calculatePerformanceMetricsByLeague,
  calculatePerformanceMetricsBySport,
} from "@/lib/analytics/performance-metrics";
import { calculateModelMetrics } from "@/lib/analytics/model-metrics";
import { getLeague, LEAGUE_REGISTRY, UnsupportedLeagueError } from "@/lib/leagues/registry";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold">{value}</span>
      </CardContent>
    </Card>
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

/** A prediction's league display name, or "—" for legacy/unprocessed rows with no league recorded yet. */
function leagueDisplayName(league: string | null): string {
  if (!league) return "—";
  try {
    return getLeague(league).displayName;
  } catch (error) {
    if (error instanceof UnsupportedLeagueError) return league;
    throw error;
  }
}

/** Overall performance and model-quality analytics for the prediction system. */
export default async function AnalysisPage({ searchParams }: PageProps<"/analysis">) {
  const params = await searchParams;
  const league = firstParam(params.league);
  const status = firstParam(params.status);
  const decision = firstParam(params.decision);
  const result = firstParam(params.result);
  const from = firstParam(params.from);
  const to = firstParam(params.to);

  const filters = [
    league && league in LEAGUE_REGISTRY ? eq(predictions.league, league) : undefined,
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
  const cumulativePnl = calculateCumulativePnl(filtered);
  const bySport = calculatePerformanceMetricsBySport(filtered);
  const byLeague = calculatePerformanceMetricsByLeague(filtered);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>

      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <Label className="flex flex-col items-start gap-1">
          League
          <select
            name="league"
            defaultValue={league ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
          >
            <option value="">All</option>
            {Object.values(LEAGUE_REGISTRY).map((l) => (
              <option key={l.key} value={l.key}>
                {l.displayName}
              </option>
            ))}
          </select>
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Decision
          <select
            name="decision"
            defaultValue={decision ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
          >
            <option value="">All</option>
            {DECISION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Label>
        <Label className="flex flex-col items-start gap-1">
          Result
          <select
            name="result"
            defaultValue={result ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
          >
            <option value="">All</option>
            {RESULT_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Label>
        <Label className="flex flex-col items-start gap-1">
          From
          <Input type="date" name="from" defaultValue={from ?? ""} className="w-36" />
        </Label>
        <Label className="flex flex-col items-start gap-1">
          To
          <Input type="date" name="to" defaultValue={to ?? ""} className="w-36" />
        </Label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Probability range</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Avg predicted</TableHead>
                  <TableHead>Actual frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.calibration.map((bucket) => (
                  <TableRow key={bucket.rangeStart}>
                    <TableCell>
                      {(bucket.rangeStart * 100).toFixed(0)}–{(bucket.rangeStart * 100 + 20).toFixed(0)}%
                    </TableCell>
                    <TableCell>{bucket.count}</TableCell>
                    <TableCell>{formatPercent(bucket.averagePredictedProbability)}</TableCell>
                    <TableCell>{formatPercent(bucket.actualFrequency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="P&L by sport family">
        {bySport.length === 0 ? (
          <p className="text-sm text-muted-foreground">No predictions match these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sport</TableHead>
                  <TableHead>Predictions</TableHead>
                  <TableHead>Win rate</TableHead>
                  <TableHead>Total P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySport.map(({ group, metrics }) => (
                  <TableRow key={group}>
                    <TableCell>{group}</TableCell>
                    <TableCell>{metrics.totalPredictions}</TableCell>
                    <TableCell>{formatPercent(metrics.winRate)}</TableCell>
                    <TableCell>{formatCents(metrics.totalPnlCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="P&L by league">
        {byLeague.length === 0 ? (
          <p className="text-sm text-muted-foreground">No predictions match these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>League</TableHead>
                  <TableHead>Win-probability model version</TableHead>
                  <TableHead>Predictions</TableHead>
                  <TableHead>Win rate</TableHead>
                  <TableHead>Total P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLeague.map(({ group, metrics }) => {
                  let displayName = "—";
                  let modelVersion = "—";
                  try {
                    const l = getLeague(group);
                    displayName = l.displayName;
                    modelVersion = l.winProbabilityModelVersion;
                  } catch (error) {
                    if (!(error instanceof UnsupportedLeagueError)) throw error;
                  }
                  return (
                    <TableRow key={group}>
                      <TableCell>{displayName}</TableCell>
                      <TableCell className="font-mono">{modelVersion}</TableCell>
                      <TableCell>{metrics.totalPredictions}</TableCell>
                      <TableCell>{formatPercent(metrics.winRate)}</TableCell>
                      <TableCell>{formatCents(metrics.totalPnlCents)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Cumulative P&L">
        {cumulativePnl.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settled predictions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Settled</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Cumulative P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cumulativePnl.map((point) => (
                  <TableRow key={point.predictionId}>
                    <TableCell>{point.finishedAt.toLocaleString()}</TableCell>
                    <TableCell>{formatCents(point.pnlCents)}</TableCell>
                    <TableCell>{formatCents(point.cumulativePnlCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="History">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>League</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>P&L</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((prediction) => (
                <TableRow key={prediction.id}>
                  <TableCell>
                    <Link href={`/predictions/${prediction.id}`} className="hover:underline">
                      {prediction.eventTitle ?? prediction.kalshiEventTicker}
                    </Link>
                  </TableCell>
                  <TableCell>{leagueDisplayName(prediction.league)}</TableCell>
                  <TableCell>{prediction.decision ?? "—"}</TableCell>
                  <TableCell>{prediction.status}</TableCell>
                  <TableCell>{prediction.settledResult ?? "—"}</TableCell>
                  <TableCell>{formatCents(prediction.pnlCents)}</TableCell>
                  <TableCell>{prediction.createdAt.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    No predictions match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}

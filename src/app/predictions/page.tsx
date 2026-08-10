import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";

/** Columns the predictions table can be sorted by. */
const SORTABLE_COLUMNS = {
  event: predictions.eventTitle,
  sport: predictions.sport,
  status: predictions.status,
  edge: predictions.netEdge,
  createdAt: predictions.createdAt,
} as const;

type SortColumn = keyof typeof SORTABLE_COLUMNS;

const DEFAULT_SORT: SortColumn = "createdAt";

const STATUS_OPTIONS = ["pending", "running", "predicted", "waiting_for_result", "finished", "failed"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && value in SORTABLE_COLUMNS;
}

function isStatusOption(value: string | undefined): value is StatusOption {
  return !!value && (STATUS_OPTIONS as readonly string[]).includes(value);
}

/** Formats a numeric probability (0-1) as a percentage string. */
function formatProbability(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatCents(value: number | null): string {
  return value == null ? "—" : `$${(value / 100).toFixed(2)}`;
}

function formatDecision(prediction: Prediction): string {
  if (!prediction.decision) return "—";
  if (prediction.decision === "no_bet") return "No bet";
  return prediction.decision === "buy_yes" ? "Buy Yes" : "Buy No";
}

function formatResult(prediction: Prediction): string {
  return prediction.settledResult ?? prediction.detectedResult ?? "—";
}

const SORT_LINK_LABELS: Record<SortColumn, string> = {
  event: "Event",
  sport: "Sport",
  status: "Status",
  edge: "Edge",
  createdAt: "Created",
};

function buildSortHref(column: SortColumn, activeSort: SortColumn, activeOrder: "asc" | "desc") {
  const nextOrder = activeSort === column && activeOrder === "asc" ? "desc" : "asc";
  return `/predictions?sort=${column}&order=${nextOrder}`;
}

/** Lists every prediction with basic sorting and status/sport filtering. */
export default async function PredictionsPage({ searchParams }: PageProps<"/predictions">) {
  const params = await searchParams;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const orderParam = Array.isArray(params.order) ? params.order[0] : params.order;
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;
  const sportFilter = Array.isArray(params.sport) ? params.sport[0] : params.sport;

  const sort = isSortColumn(sortParam) ? sortParam : DEFAULT_SORT;
  const order = orderParam === "asc" ? "asc" : "desc";
  const orderFn = order === "asc" ? asc : desc;

  const filters = [
    isStatusOption(statusFilter) ? eq(predictions.status, statusFilter) : undefined,
    sportFilter ? eq(predictions.sport, sportFilter) : undefined,
  ].filter((f) => f !== undefined);

  const rows = await db
    .select()
    .from(predictions)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderFn(SORTABLE_COLUMNS[sort]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Predictions</h1>

      <form className="flex items-center gap-2 text-sm" method="get">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <label className="flex items-center gap-1">
          Status
          <select name="status" defaultValue={statusFilter ?? ""} className="rounded border bg-background px-2 py-1">
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Sport
          <input
            type="text"
            name="sport"
            defaultValue={sportFilter ?? ""}
            placeholder="e.g. nfl"
            className="rounded border bg-background px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-muted">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              {(Object.keys(SORTABLE_COLUMNS) as SortColumn[]).map((column) => (
                <th key={column} className="px-3 py-2 font-medium">
                  <Link href={buildSortHref(column, sort, order)} className="hover:underline">
                    {SORT_LINK_LABELS[column]}
                    {sort === column ? (order === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Prediction</th>
              <th className="px-3 py-2 font-medium">Market %</th>
              <th className="px-3 py-2 font-medium">Model %</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((prediction) => (
              <tr key={prediction.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/predictions/${prediction.id}`} className="hover:underline">
                    {prediction.eventTitle ?? prediction.kalshiEventTicker}
                  </Link>
                </td>
                <td className="px-3 py-2">{prediction.sport ?? "—"}</td>
                <td className="px-3 py-2">{prediction.status}</td>
                <td className="px-3 py-2">
                  {prediction.netEdge == null ? "—" : `${(prediction.netEdge * 100).toFixed(1)}%`}
                </td>
                <td className="px-3 py-2">{prediction.createdAt.toLocaleString()}</td>
                <td className="px-3 py-2">{formatDecision(prediction)}</td>
                <td className="px-3 py-2">{formatProbability(prediction.marketPrice)}</td>
                <td className="px-3 py-2">{formatProbability(prediction.modelProbability)}</td>
                <td className="px-3 py-2">{formatResult(prediction)}</td>
                <td className="px-3 py-2">{formatCents(prediction.pnlCents)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  No predictions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";
import type { Prediction } from "@/database/schemas";
import { DeletePredictionButton } from "@/components/delete-prediction-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

      <form className="flex items-end gap-2 text-sm" method="get">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="order" value={order} />
        <Label className="flex flex-col items-start gap-1">
          Status
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
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
          Sport
          <Input type="text" name="sport" defaultValue={sportFilter ?? ""} placeholder="e.g. nfl" className="w-32" />
        </Label>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {(Object.keys(SORTABLE_COLUMNS) as SortColumn[]).map((column) => (
                <TableHead key={column}>
                  <Link href={buildSortHref(column, sort, order)} className="hover:underline">
                    {SORT_LINK_LABELS[column]}
                    {sort === column ? (order === "asc" ? " ↑" : " ↓") : ""}
                  </Link>
                </TableHead>
              ))}
              <TableHead>Prediction</TableHead>
              <TableHead>Market %</TableHead>
              <TableHead>Model %</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>P&L</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((prediction) => (
              <TableRow key={prediction.id}>
                <TableCell>
                  <Link href={`/predictions/${prediction.id}`} className="hover:underline">
                    {prediction.eventTitle ?? prediction.kalshiEventTicker}
                  </Link>
                </TableCell>
                <TableCell>{prediction.sport ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{prediction.status}</Badge>
                </TableCell>
                <TableCell>
                  {prediction.netEdge == null ? "—" : `${(prediction.netEdge * 100).toFixed(1)}%`}
                </TableCell>
                <TableCell>{prediction.createdAt.toLocaleString()}</TableCell>
                <TableCell>{formatDecision(prediction)}</TableCell>
                <TableCell>{formatProbability(prediction.marketPrice)}</TableCell>
                <TableCell>{formatProbability(prediction.modelProbability)}</TableCell>
                <TableCell>{formatResult(prediction)}</TableCell>
                <TableCell>{formatCents(prediction.pnlCents)}</TableCell>
                <TableCell>
                  <DeletePredictionButton predictionId={prediction.id} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-6 text-center text-muted-foreground">
                  No predictions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

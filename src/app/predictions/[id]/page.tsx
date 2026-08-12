import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowDown } from "lucide-react";

import { db } from "@/lib/db";
import {
  modelOutputs,
  predictionStages,
  predictions,
  predictionVersionMetadata,
  technicalAnalyses,
} from "@/database/schemas";
import { PredictionProgress } from "@/components/prediction-progress";
import { PredictionTimeline } from "@/components/prediction-timeline";
import { RetryPredictionButton } from "@/components/retry-prediction-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatProbability(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function formatCents(value: number | null | undefined): string {
  return value == null ? "—" : `$${(value / 100).toFixed(2)}`;
}

function DefinitionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  probability,
  emphasis = false,
  children,
}: {
  title: string;
  probability?: string;
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(emphasis && "ring-2 ring-primary")}>
      <CardHeader className="flex-row items-baseline justify-between gap-4">
        <CardTitle className={emphasis ? "text-xl" : "text-lg"}>{title}</CardTitle>
        {probability && (
          <span className={cn("shrink-0 font-mono tabular-nums", emphasis ? "text-2xl font-semibold" : "text-lg")}>
            {probability}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}

/** Visual connector implying "feeds into" between pipeline phases. */
function FeedsInto() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="size-5 text-muted-foreground" />
    </div>
  );
}

function decisionBadgeVariant(decision: string | null): "default" | "secondary" | "outline" {
  if (decision === "buy_yes" || decision === "buy_no") return "default";
  return "secondary";
}

/**
 * Full detail view for a single prediction, laid out to mirror the pipeline
 * itself: Phase 1 and Phase 2 run independently and are shown side by side,
 * Phase 3 (the LLM combiner) visually depends on both, and the final blended
 * decision is the payoff at the very bottom rather than led with at the top.
 */
export default async function PredictionPage({ params }: PageProps<"/predictions/[id]">) {
  const { id } = await params;

  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  if (!prediction) {
    notFound();
  }

  const [stages, [technical], [combiner], [versionMetadata]] = await Promise.all([
    db
      .select()
      .from(predictionStages)
      .where(eq(predictionStages.predictionId, id))
      .orderBy(asc(predictionStages.startedAt)),
    db.select().from(technicalAnalyses).where(eq(technicalAnalyses.predictionId, id)).limit(1),
    db.select().from(modelOutputs).where(eq(modelOutputs.predictionId, id)).limit(1),
    db
      .select()
      .from(predictionVersionMetadata)
      .where(eq(predictionVersionMetadata.predictionId, id))
      .limit(1),
  ]);

  const isFinished = prediction.status === "finished";
  const hasEspn = technical?.espnAnalytics != null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/predictions" className="w-fit text-sm text-muted-foreground hover:underline">
        ← Back to predictions
      </Link>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {prediction.eventTitle ?? prediction.kalshiEventTicker}
        </h1>
        {prediction.status === "failed" && <RetryPredictionButton predictionId={prediction.id} />}
      </div>

      <PredictionProgress predictionId={prediction.id} initialData={{ prediction, stages }} />

      <Section title="Prediction">
        <DefinitionList
          items={[
            ["Event", prediction.eventTitle ?? "—"],
            ["Ticker", <span key="ticker" className="font-mono">{prediction.kalshiEventTicker}</span>],
            ["Sport", prediction.sport ?? "—"],
            ["Status", <Badge key="status" variant="secondary">{prediction.status}</Badge>],
            ["Prediction time", prediction.predictedAt?.toLocaleString() ?? "—"],
            ["Market probability", formatProbability(prediction.marketPrice)],
            ["Error", prediction.errorMessage ?? "—"],
          ]}
        />
      </Section>

      <Section title="Timeline">
        <PredictionTimeline stages={stages} />
      </Section>

      {versionMetadata && (
        <Section title="Model version">
          <DefinitionList
            items={[
              [
                "Prediction config version",
                <Link
                  key="config-link"
                  href={`/config/${versionMetadata.predictionConfigId}`}
                  className="underline hover:no-underline"
                >
                  v{versionMetadata.predictionConfigId}
                </Link>,
              ],
              ["Technical model version", versionMetadata.technicalModelVersion],
              ["Combiner version", versionMetadata.combinerVersion],
            ]}
          />
        </Section>
      )}

      {(technical || hasEspn) && (
        <div className="grid gap-4 md:grid-cols-2">
          {technical && (
            <Section title="Phase 1: Team scores / game progress" probability={formatProbability(technical.probability)}>
              <DefinitionList
                items={[
                  ["Team scores", `${technical.team1Score} – ${technical.team2Score}`],
                  ["Game progress", formatPercent(technical.gameProgress)],
                  ["k", technical.k],
                ]}
              />
            </Section>
          )}

          {hasEspn && (
            <Section title="Phase 2: ESPN analysis" probability={formatProbability(technical!.espnWinProbability)}>
              <DefinitionList
                items={[
                  ["Model version", technical!.espnModelVersion ?? "—"],
                  ["Team 1 strength", technical!.team1OpponentAdjustedStrength?.toFixed(3) ?? "—"],
                  ["Team 2 strength", technical!.team2OpponentAdjustedStrength?.toFixed(3) ?? "—"],
                  ["Team 1 availability risk", technical!.team1AvailabilityRisk ? "Yes" : "No"],
                  ["Team 2 availability risk", technical!.team2AvailabilityRisk ? "Yes" : "No"],
                  ["Team 1 lost production", technical!.team1LostProduction?.toFixed(2) ?? "—"],
                  ["Team 2 lost production", technical!.team2LostProduction?.toFixed(2) ?? "—"],
                  ["Composite edge", technical!.compositeEdge?.toFixed(3) ?? "—"],
                  ["Market spread", technical!.marketSpread ?? "—"],
                  ["Market total", technical!.marketTotal ?? "—"],
                  ["Market moneyline (home)", technical!.marketMoneylineHome ?? "—"],
                  ["Market moneyline (away)", technical!.marketMoneylineAway ?? "—"],
                ]}
              />
            </Section>
          )}
        </div>
      )}

      {combiner && (
        <>
          <FeedsInto />
          <Section title="Phase 3: LLM combiner" probability={formatProbability(combiner.combinerProbability)}>
            <DefinitionList
              items={[
                ["Technical probability", formatProbability(combiner.technicalProbability)],
                ["Technical weight", formatPercent(combiner.technicalWeight)],
                ["ESPN probability", formatProbability(combiner.espnProbability)],
                ["ESPN weight", formatPercent(combiner.espnWeight)],
                ["Combiner weight", formatPercent(combiner.combinerWeight)],
                ["Combiner version", combiner.combinerModelVersion],
                ["Combiner output", <pre key="combiner-output" className="whitespace-pre-wrap text-xs">{JSON.stringify(combiner.claudeOutput, null, 2)}</pre>],
              ]}
            />
          </Section>
        </>
      )}

      <FeedsInto />

      <Section title="Final prediction" probability={formatProbability(combiner?.finalProbability ?? prediction.modelProbability)} emphasis>
        <DefinitionList
          items={[
            ["Model probability", formatProbability(prediction.modelProbability)],
            ["Raw edge", formatPercent(prediction.rawEdge)],
            ["Fees", formatCents(prediction.feesCents)],
            ["Net edge", formatPercent(prediction.netEdge)],
            [
              "Decision",
              prediction.decision ? (
                <Badge key="decision" variant={decisionBadgeVariant(prediction.decision)}>
                  {prediction.decision}
                </Badge>
              ) : (
                "—"
              ),
            ],
          ]}
        />
      </Section>

      {isFinished && (
        <Section title="Result">
          <DefinitionList
            items={[
              ["Detected result", prediction.detectedResult ?? "—"],
              ["Settled result", prediction.settledResult ?? "—"],
              ["Won/lost", prediction.winLoss ?? "—"],
              ["P&L", formatCents(prediction.pnlCents)],
              ["Return percentage", formatPercent(prediction.returnPercentage)],
            ]}
          />
        </Section>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  modelOutputs,
  predictionStages,
  predictions,
  sentimentAnalyses,
  technicalAnalyses,
} from "@/database/schemas";
import { PredictionProgress } from "@/components/prediction-progress";
import { PredictionTimeline } from "@/components/prediction-timeline";
import { RetryPredictionButton } from "@/components/retry-prediction-button";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Full detail view for a single prediction: the decision itself, each stage
 * of model reasoning (technical, sentiment, combiner), and the settlement
 * result once available. Live pipeline progress is shown while pending/running.
 */
export default async function PredictionPage({ params }: PageProps<"/predictions/[id]">) {
  const { id } = await params;

  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  if (!prediction) {
    notFound();
  }

  const [stages, [technical], [sentiment], [combiner]] = await Promise.all([
    db
      .select()
      .from(predictionStages)
      .where(eq(predictionStages.predictionId, id))
      .orderBy(asc(predictionStages.startedAt)),
    db.select().from(technicalAnalyses).where(eq(technicalAnalyses.predictionId, id)).limit(1),
    db.select().from(sentimentAnalyses).where(eq(sentimentAnalyses.predictionId, id)).limit(1),
    db.select().from(modelOutputs).where(eq(modelOutputs.predictionId, id)).limit(1),
  ]);

  const isFinished = prediction.status === "finished";

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

      <Section title="Timeline">
        <PredictionTimeline stages={stages} />
      </Section>

      <Section title="Prediction">
        <DefinitionList
          items={[
            ["Event", prediction.eventTitle ?? "—"],
            ["Ticker", <span key="ticker" className="font-mono">{prediction.kalshiEventTicker}</span>],
            ["Sport", prediction.sport ?? "—"],
            ["Status", prediction.status],
            ["Prediction time", prediction.predictedAt?.toLocaleString() ?? "—"],
            ["Market probability", formatProbability(prediction.marketPrice)],
            ["Model probability", formatProbability(prediction.modelProbability)],
            ["Raw edge", formatPercent(prediction.rawEdge)],
            ["Fees", formatCents(prediction.feesCents)],
            ["Net edge", formatPercent(prediction.netEdge)],
            ["Decision", prediction.decision ?? "—"],
            ["Error", prediction.errorMessage ?? "—"],
          ]}
        />
      </Section>

      {technical && (
        <Section title="Technical analysis">
          <DefinitionList
            items={[
              ["Team scores", `${technical.team1Score} – ${technical.team2Score}`],
              ["Game progress", formatPercent(technical.gameProgress)],
              ["k", technical.k],
              ["Probability", formatProbability(technical.probability)],
              ["Model version", technical.analysisVersion],
            ]}
          />
        </Section>
      )}

      {sentiment && (
        <Section title="Sentiment">
          <DefinitionList
            items={[
              ["Articles analyzed", sentiment.articlesConsidered.length],
              ["Sentiment result", JSON.stringify(sentiment.sentimentScores)],
              ["Probability", formatProbability(sentiment.probability)],
              ["Model version", sentiment.sentimentModelVersion],
            ]}
          />
        </Section>
      )}

      {combiner && (
        <Section title="Combiner">
          <DefinitionList
            items={[
              ["Technical weight", formatPercent(combiner.technicalWeight)],
              ["Sentiment weight", formatPercent(combiner.sentimentWeight)],
              ["Final probability", formatProbability(combiner.finalProbability)],
              ["Claude output", <pre key="claude" className="whitespace-pre-wrap text-xs">{JSON.stringify(combiner.claudeOutput, null, 2)}</pre>],
              ["Combiner version", combiner.combinerModelVersion],
            ]}
          />
        </Section>
      )}

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

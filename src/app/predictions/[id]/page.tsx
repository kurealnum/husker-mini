import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictionStages, predictions } from "@/database/schemas";
import { PredictionProgress } from "@/components/prediction-progress";

/**
 * Shows a single prediction's current state, including live pipeline
 * progress while it is pending/running. The full historical timeline and
 * settlement details land in later issues.
 */
export default async function PredictionPage({ params }: PageProps<"/predictions/[id]">) {
  const { id } = await params;

  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  if (!prediction) {
    notFound();
  }

  const stages = await db
    .select()
    .from(predictionStages)
    .where(eq(predictionStages.predictionId, id))
    .orderBy(asc(predictionStages.startedAt));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {prediction.eventTitle ?? prediction.kalshiEventTicker}
      </h1>
      <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>{prediction.status}</dd>
        <dt className="text-muted-foreground">Ticker</dt>
        <dd className="font-mono">{prediction.kalshiEventTicker}</dd>
        <dt className="text-muted-foreground">Sport</dt>
        <dd>{prediction.sport ?? "—"}</dd>
        {prediction.errorMessage && (
          <>
            <dt className="text-destructive">Error</dt>
            <dd className="text-destructive">{prediction.errorMessage}</dd>
          </>
        )}
      </dl>
      <PredictionProgress predictionId={prediction.id} initialData={{ prediction, stages }} />
    </div>
  );
}

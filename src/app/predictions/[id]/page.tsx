import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";

/**
 * Shows a single prediction's current state. This is a minimal progress
 * view; live updates and stage-by-stage timeline land in later issues.
 */
export default async function PredictionPage({ params }: PageProps<"/predictions/[id]">) {
  const { id } = await params;

  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  if (!prediction) {
    notFound();
  }

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
    </div>
  );
}

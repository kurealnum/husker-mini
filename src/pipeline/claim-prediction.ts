import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";

/**
 * Resets predictions stuck in `running` back to `pending` so they get picked
 * up again by the poll loop. Call once at worker startup, before claiming
 * any job. It is safe only because exactly one worker process claims jobs at
 * a time: any prediction still `running` when this process starts was left
 * behind by a previous instance of this same worker that died mid-pipeline,
 * not by a sibling process that could still be working on it. Running
 * multiple worker instances concurrently would break this assumption and
 * risk a prediction executing twice.
 */
export async function recoverStalePredictions(): Promise<void> {
  const recovered = await db
    .update(predictions)
    .set({ status: "pending" })
    .where(eq(predictions.status, "running"))
    .returning({ id: predictions.id });

  if (recovered.length > 0) {
    console.log(`Recovered ${recovered.length} prediction(s) stuck in running.`);
  }
}

/**
 * Atomically claims one pending prediction by flipping its status to
 * `running`. Returns the claimed prediction's id, or `null` if no pending
 * prediction is available. The `WHERE status = 'pending'` guard on the
 * update makes this safe under concurrent claimers: only the caller that
 * wins the race actually flips the row, so a prediction is never claimed
 * twice.
 */
export async function claimPendingPrediction(): Promise<string | null> {
  const [pending] = await db
    .select({ id: predictions.id })
    .from(predictions)
    .where(eq(predictions.status, "pending"))
    .limit(1);

  if (!pending) {
    return null;
  }

  const [claimed] = await db
    .update(predictions)
    .set({ status: "running" })
    .where(and(eq(predictions.id, pending.id), eq(predictions.status, "pending")))
    .returning({ id: predictions.id });

  return claimed?.id ?? null;
}

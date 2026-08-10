/**
 * Prediction worker entrypoint. Polls for pending prediction jobs, claims one
 * at a time via an atomic `pending -> running` transition, and runs the
 * prediction pipeline to completion. Safe to restart: a claim only succeeds
 * against a row still in `pending`, so concurrent or restarted workers never
 * double-claim the same job.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import { predictions } from "@/database/schemas";
import { runPrediction } from "@/pipeline/run-prediction";

const POLL_INTERVAL_MS = Number(process.env.PREDICTION_WORKER_POLL_INTERVAL_MS ?? 5000);

/**
 * Resets predictions stuck in `running` back to `pending` so they get picked
 * up again by the poll loop. This runs once at startup, before any job is
 * claimed. It is safe only because exactly one worker process claims jobs at
 * a time: any prediction still `running` when this process starts was left
 * behind by a previous instance of this same worker that died mid-pipeline,
 * not by a sibling process that could still be working on it. Running
 * multiple worker instances concurrently would break this assumption and
 * risk a prediction executing twice.
 */
async function recoverStalePredictions(): Promise<void> {
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
 * prediction is available.
 */
async function claimPendingPrediction(): Promise<string | null> {
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

/** Claims and runs a single prediction job, if one is available. */
async function processNextJob(): Promise<void> {
  const predictionId = await claimPendingPrediction();
  if (!predictionId) {
    return;
  }

  console.log(`Claimed prediction ${predictionId}.`);
  try {
    await runPrediction(predictionId);
    console.log(`Prediction ${predictionId} completed.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Prediction ${predictionId} failed: ${message}`);
  }
}

async function pollLoop(): Promise<void> {
  try {
    await processNextJob();
  } catch (error) {
    console.error("Prediction worker poll iteration failed:", error);
  } finally {
    setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

async function main() {
  // Validate configuration before doing any work, so misconfiguration fails
  // loudly at startup instead of surfacing as a mysterious failure on the
  // first claimed prediction.
  getPredictionConfig();

  console.log("Prediction worker started.");
  await recoverStalePredictions();
  await pollLoop();
}

main();

export {};

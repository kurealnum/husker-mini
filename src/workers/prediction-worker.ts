/**
 * Prediction worker entrypoint. Polls for pending prediction jobs, claims one
 * at a time via an atomic `pending -> running` transition, and runs the
 * prediction pipeline to completion. Safe to restart: a claim only succeeds
 * against a row still in `pending`, so concurrent or restarted workers never
 * double-claim the same job.
 */
import { getActivePredictionConfigVersion, getStaticPredictionConfig } from "@/lib/config/prediction-config";
import { claimPendingPrediction, recoverStalePredictions } from "@/pipeline/claim-prediction";
import { runPrediction } from "@/pipeline/run-prediction";

const POLL_INTERVAL_MS = Number(process.env.PREDICTION_WORKER_POLL_INTERVAL_MS ?? 5000);

/**
 * Refuses to run with `STUB_EXTERNAL_CALLS` and `LIVE_TRADING_ENABLED` both
 * set, since the combiner stage would then place real orders against a
 * made-up combiner probability (see `combine-analyses.ts`).
 */
function assertStubLiveTradingSafe(): void {
  if (process.env.STUB_EXTERNAL_CALLS === "true" && process.env.LIVE_TRADING_ENABLED === "true") {
    throw new Error(
      "STUB_EXTERNAL_CALLS and LIVE_TRADING_ENABLED cannot both be true — that would place real orders against a made-up combiner probability.",
    );
  }
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
  assertStubLiveTradingSafe();
  getStaticPredictionConfig();
  await getActivePredictionConfigVersion();

  console.log("Prediction worker started.");
  await recoverStalePredictions();
  await pollLoop();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});

export {};

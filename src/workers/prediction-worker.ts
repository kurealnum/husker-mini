/**
 * Prediction worker entrypoint. Polls for pending prediction jobs, claims one
 * at a time via an atomic `pending -> running` transition, and runs the
 * prediction pipeline to completion. Safe to restart: a claim only succeeds
 * against a row still in `pending`, so concurrent or restarted workers never
 * double-claim the same job.
 */
import {
  getActivePredictionConfigVersion,
  getStaticPredictionConfig,
  MissingPredictionConfigVersionError,
} from "@/lib/config/prediction-config";
import { LEAGUE_REGISTRY } from "@/lib/leagues/registry";
import { claimPendingPrediction, recoverStalePredictions } from "@/pipeline/claim-prediction";
import { runPrediction } from "@/pipeline/run-prediction";

const POLL_INTERVAL_MS = Number(process.env.PREDICTION_WORKER_POLL_INTERVAL_MS ?? 5000);

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
  // first claimed prediction. Config is now per league — warn (don't crash)
  // on a league missing a config version, since a killed or not-yet-tuned
  // league shouldn't block every other league's worker from starting.
  getStaticPredictionConfig();
  for (const league of Object.values(LEAGUE_REGISTRY)) {
    try {
      await getActivePredictionConfigVersion(league.key);
    } catch (error) {
      if (error instanceof MissingPredictionConfigVersionError) {
        console.warn(error.message);
        continue;
      }
      throw error;
    }
  }

  console.log("Prediction worker started.");
  await recoverStalePredictions();
  await pollLoop();
}

main();

export {};

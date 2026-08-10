/**
 * Settlement worker entrypoint. Every poll interval, checks every prediction
 * `waiting_for_result` against Kalshi. If Kalshi has settled the market, the
 * prediction is finalized; otherwise it is left untouched for the next poll.
 */
import { checkWaitingPredictions } from "@/pipeline/check-settlement";

const POLL_INTERVAL_MS = Number(process.env.SETTLEMENT_WORKER_POLL_INTERVAL_MS ?? 60000);

async function pollLoop(): Promise<void> {
  try {
    await checkWaitingPredictions();
  } catch (error) {
    console.error("Settlement worker poll iteration failed:", error);
  } finally {
    setTimeout(pollLoop, POLL_INTERVAL_MS);
  }
}

async function main() {
  console.log("Settlement worker started.");
  // Check all unfinished predictions immediately on startup — a restart must
  // not delay noticing a settlement that happened while the worker was down.
  await pollLoop();
}

main();

export {};

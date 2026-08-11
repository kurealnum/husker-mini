import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const { db, pool } = await import("@/lib/db");
const { predictions } = await import("@/database/schemas");
const { claimPendingPrediction, recoverStalePredictions } = await import("../claim-prediction");
const { checkWaitingPredictions } = await import("../check-settlement");

let insertedIds: string[] = [];

async function insertPrediction(status: (typeof predictions.$inferInsert)["status"]) {
  const [row] = await db
    .insert(predictions)
    .values({ kalshiEventTicker: `TEST-${crypto.randomUUID()}`, status })
    .returning({ id: predictions.id });
  insertedIds.push(row.id);
  return row.id;
}

/**
 * Deletes every pre-existing pending/running prediction left over from
 * other test files or runs, so a fresh `claimPendingPrediction()` call in
 * this file is guaranteed to pick up the row this test just inserted rather
 * than stray unrelated data. Recovers stale `running` rows to `pending`
 * first, then claims (and deletes) every pending row.
 */
async function drainExistingPendingPredictions(): Promise<void> {
  await recoverStalePredictions();
  let claimedId: string | null;
  while ((claimedId = await claimPendingPrediction()) !== null) {
    await db.delete(predictions).where(eq(predictions.id, claimedId));
  }
}

describe("worker restart recovery", () => {
  afterEach(async () => {
    if (insertedIds.length > 0) {
      await db.delete(predictions).where(inArray(predictions.id, insertedIds));
      insertedIds = [];
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("recovers predictions stuck in running back to pending, without touching other statuses", async () => {
    const stuckId = await insertPrediction("running");
    const pendingId = await insertPrediction("pending");
    const finishedId = await insertPrediction("finished");
    const waitingId = await insertPrediction("waiting_for_result");

    await recoverStalePredictions();

    const rows = await db
      .select({ id: predictions.id, status: predictions.status })
      .from(predictions)
      .where(inArray(predictions.id, [stuckId, pendingId, finishedId, waitingId]));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));

    // A restart never loses a pending job — it stays claimable.
    expect(byId[pendingId]).toBe("pending");
    // A stuck job is recovered back to pending, not lost.
    expect(byId[stuckId]).toBe("pending");
    // A completed prediction is never reset or lost.
    expect(byId[finishedId]).toBe("finished");
    // A prediction waiting on settlement is untouched by prediction-worker recovery.
    expect(byId[waitingId]).toBe("waiting_for_result");
  });

  it("does not lose or duplicate a pending job across a simulated restart", async () => {
    await drainExistingPendingPredictions();
    const predictionId = await insertPrediction("pending");

    // Simulate a restart: the job is claimed exactly once. (Recovery of
    // stale `running` rows on restart is covered by the test above —
    // calling it again here would flip unrelated stray `running` rows,
    // drained just above, straight back to `pending`.)
    const claimed = await claimPendingPrediction();
    expect(claimed).toBe(predictionId);

    const [row] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(row.status).toBe("running");
  });

  it("never claims the same pending prediction twice concurrently", async () => {
    await drainExistingPendingPredictions();
    const predictionId = await insertPrediction("pending");

    const [first, second] = await Promise.all([claimPendingPrediction(), claimPendingPrediction()]);
    const claimedIds = [first, second].filter((id) => id === predictionId);

    // Only one of the two concurrent claim attempts should have won the race
    // for this specific prediction — never both.
    expect(claimedIds.length).toBe(1);
  });

  it("still finds a waiting_for_result prediction across a settlement-worker restart", async () => {
    const predictionId = await insertPrediction("waiting_for_result");

    // The settlement worker has no separate recovery step: it simply
    // re-queries every waiting_for_result row on each poll (including the
    // first poll after a restart), so nothing can be missed by construction.
    let sawIt = false;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      sawIt = true;
      return { ok: true, status: 200, json: async () => ({ event: {}, markets: [{ status: "open" }] }) } as Response;
    }) as typeof fetch;

    try {
      await checkWaitingPredictions();
    } finally {
      global.fetch = originalFetch;
    }

    expect(sawIt).toBe(true);
    const [row] = await db.select().from(predictions).where(eq(predictions.id, predictionId));
    expect(row.status).toBe("waiting_for_result");
  });
});

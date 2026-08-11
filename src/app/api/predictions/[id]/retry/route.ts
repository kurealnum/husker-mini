import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";

/**
 * Resets a failed prediction back to `pending` so the prediction worker
 * picks it up again. Only valid for predictions currently in `failed` —
 * the update is scoped to that status so a concurrent retry can't
 * re-queue a prediction that's already running or finished.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [updated] = await db
    .update(predictions)
    .set({ status: "pending", errorMessage: null })
    .where(and(eq(predictions.id, id), eq(predictions.status, "failed")))
    .returning({ id: predictions.id });

  if (!updated) {
    return NextResponse.json({ error: "Prediction not found or not in a failed state." }, { status: 409 });
  }

  return NextResponse.json({ id: updated.id });
}

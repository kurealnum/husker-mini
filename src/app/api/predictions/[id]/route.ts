import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictionStages, predictions } from "@/database/schemas";

/** Returns a prediction and its pipeline stages, for progress polling. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
  if (!prediction) {
    return NextResponse.json({ error: "Prediction not found." }, { status: 404 });
  }

  const stages = await db
    .select()
    .from(predictionStages)
    .where(eq(predictionStages.predictionId, id))
    .orderBy(asc(predictionStages.startedAt));

  return NextResponse.json({ prediction, stages });
}

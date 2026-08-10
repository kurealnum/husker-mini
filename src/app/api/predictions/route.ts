import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isValidKalshiTicker } from "@/lib/kalshi-ticker";
import { predictions } from "@/database/schemas";

/**
 * Creates a prediction job for a Kalshi ticker. The row is inserted with
 * status `pending`, which the prediction worker polls for and claims — no
 * separate job queue is needed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const ticker = (body as { ticker?: unknown })?.ticker;
  if (typeof ticker !== "string" || !isValidKalshiTicker(ticker)) {
    return NextResponse.json({ error: "ticker must be a valid Kalshi event ticker." }, { status: 400 });
  }

  const [prediction] = await db
    .insert(predictions)
    .values({ kalshiEventTicker: ticker, status: "pending" })
    .returning({ id: predictions.id });

  return NextResponse.json({ id: prediction.id }, { status: 201 });
}

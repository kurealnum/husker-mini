import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getActivePredictionConfigVersion, MissingPredictionConfigVersionError } from "@/lib/config/prediction-config";
import { isValidKalshiTicker } from "@/lib/kalshi-ticker";
import { resolveLeagueFromTicker, UnsupportedLeagueError } from "@/lib/leagues/registry";
import { predictions } from "@/database/schemas";

/**
 * Creates a prediction job for a Kalshi ticker. The row is inserted with
 * status `pending`, which the prediction worker polls for and claims — no
 * separate job queue is needed.
 *
 * The ticker's league and that league's kill switch are checked up front so
 * an unsupported series or a killed league fails immediately, here, with a
 * specific message — instead of being accepted and only failing once the
 * worker picks it up minutes later.
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

  let league;
  try {
    league = resolveLeagueFromTicker(ticker);
  } catch (error) {
    if (error instanceof UnsupportedLeagueError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const configVersion = await getActivePredictionConfigVersion(league.key);
    if (configVersion.killSwitchEnabled) {
      return NextResponse.json(
        { error: `${league.displayName}'s kill switch is enabled; no new predictions can be started for it.` },
        { status: 400 },
      );
    }
  } catch (error) {
    if (error instanceof MissingPredictionConfigVersionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const [prediction] = await db
    .insert(predictions)
    .values({ kalshiEventTicker: ticker, status: "pending" })
    .returning({ id: predictions.id });

  return NextResponse.json({ id: prediction.id }, { status: 201 });
}

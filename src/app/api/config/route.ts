import { NextResponse } from "next/server";

import {
  BacktestGateNotMetError,
  createPredictionConfigVersion,
  listPredictionConfigVersions,
} from "@/lib/config/prediction-config";
import { getLeague, UnsupportedLeagueError } from "@/lib/leagues/registry";
import type { NewPredictionConfigVersion } from "@/database/schemas";

const NUMERIC_FIELDS = ["technicalK", "technicalWeight", "espnWeight", "combinerWeight", "edgeThreshold"] as const;
const STRING_FIELDS = ["combinerModel"] as const;
const TRADING_MODES = ["paper", "live"] as const;

/** Returns every prediction config version for a league (`?league=`), newest (highest id) first. */
export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get("league");
  if (!league) {
    return NextResponse.json({ error: "league query parameter is required." }, { status: 400 });
  }
  try {
    getLeague(league);
  } catch (error) {
    if (error instanceof UnsupportedLeagueError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const versions = await listPredictionConfigVersions(league);
  return NextResponse.json(versions);
}

/**
 * Creates a new prediction config version for one league. Versions are
 * append-only — this never updates an existing row, so predictions already
 * attached to an older version stay reproducible. Rejects `tradingMode:
 * "live"` unless a passing backtest result is included in the same request
 * (see `assertBacktestGate`) — the safety gate is enforced here, not just in
 * the UI.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  const league = record.league;
  if (typeof league !== "string" || !league.trim()) {
    return NextResponse.json({ error: "league is required." }, { status: 400 });
  }
  try {
    getLeague(league);
  } catch (error) {
    if (error instanceof UnsupportedLeagueError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const numericInput: Record<string, number> = {};
  for (const field of NUMERIC_FIELDS) {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ error: `${field} must be a finite number.` }, { status: 400 });
    }
    numericInput[field] = value;
  }

  const stringInput: Record<string, string> = {};
  for (const field of STRING_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: `${field} must be a non-empty string.` }, { status: 400 });
    }
    stringInput[field] = value.trim();
  }

  const tradingMode = record.tradingMode ?? "paper";
  if (!TRADING_MODES.includes(tradingMode as (typeof TRADING_MODES)[number])) {
    return NextResponse.json({ error: `tradingMode must be one of ${TRADING_MODES.join(", ")}.` }, { status: 400 });
  }

  const killSwitchEnabled = Boolean(record.killSwitchEnabled);

  const backtestAccuracy = record.backtestAccuracy;
  const backtestThreshold = record.backtestThreshold;
  if (backtestAccuracy != null && typeof backtestAccuracy !== "number") {
    return NextResponse.json({ error: "backtestAccuracy must be a number." }, { status: 400 });
  }
  if (backtestThreshold != null && typeof backtestThreshold !== "number") {
    return NextResponse.json({ error: "backtestThreshold must be a number." }, { status: 400 });
  }
  const backtestNotes = typeof record.backtestNotes === "string" ? record.backtestNotes : undefined;

  const input: NewPredictionConfigVersion = {
    league,
    technicalK: numericInput.technicalK,
    technicalWeight: numericInput.technicalWeight,
    espnWeight: numericInput.espnWeight,
    combinerWeight: numericInput.combinerWeight,
    edgeThreshold: numericInput.edgeThreshold,
    combinerModel: stringInput.combinerModel,
    tradingMode: tradingMode as "paper" | "live",
    killSwitchEnabled,
    backtestAccuracy: (backtestAccuracy as number | null) ?? null,
    backtestThreshold: (backtestThreshold as number | null) ?? null,
    backtestRecordedAt: backtestAccuracy != null ? new Date() : null,
    backtestNotes: backtestNotes ?? null,
  };

  try {
    const version = await createPredictionConfigVersion(input);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    if (error instanceof BacktestGateNotMetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

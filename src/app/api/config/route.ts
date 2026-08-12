import { NextResponse } from "next/server";

import {
  createPredictionConfigVersion,
  listPredictionConfigVersions,
} from "@/lib/config/prediction-config";

const NUMERIC_FIELDS = ["technicalK", "technicalWeight", "espnWeight", "combinerWeight", "edgeThreshold"] as const;

/** Returns every prediction config version, newest (highest id) first. */
export async function GET() {
  const versions = await listPredictionConfigVersions();
  return NextResponse.json(versions);
}

/**
 * Creates a new prediction config version. Versions are append-only — this
 * never updates an existing row, so predictions already attached to an
 * older version stay reproducible.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const input: Record<string, number> = {};
  for (const field of NUMERIC_FIELDS) {
    const value = (body as Record<string, unknown>)?.[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return NextResponse.json({ error: `${field} must be a finite number.` }, { status: 400 });
    }
    input[field] = value;
  }

  const version = await createPredictionConfigVersion({
    technicalK: input.technicalK,
    technicalWeight: input.technicalWeight,
    espnWeight: input.espnWeight,
    combinerWeight: input.combinerWeight,
    edgeThreshold: input.edgeThreshold,
  });

  return NextResponse.json(version, { status: 201 });
}

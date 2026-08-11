import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictionConfigs, type NewPredictionConfigVersion, type PredictionConfigVersion } from "@/database/schemas";

/** Non-versioned prediction model settings, read from environment variables. */
export interface StaticPredictionConfig {
  /** OpenAI model id used to combine and reason over the technical analysis. */
  combinerModel: string;
  /** Fraction of full Kelly to stake on a trade. Defaults to 0.15 (15%). */
  kellyFraction: number;
  /** Starting bankroll, in cents, before any settled P&L. Defaults to 0. */
  startingBankrollCents: number;
  /** Minimum contract count for a sized position; sizes below this are treated as no position. */
  minContracts: number;
  /** Maximum contract count for a single sized position. */
  maxContracts: number;
  /** When false (the default), the execute_order stage never calls Kalshi's orders endpoint. */
  liveTradingEnabled: boolean;
}

/** Raised when one or more required prediction config values are missing or invalid. */
export class InvalidPredictionConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid prediction configuration:\n- ${problems.join("\n- ")}`);
    this.name = "InvalidPredictionConfigError";
  }
}

/** Raised when no prediction config version exists in the database yet. */
export class MissingPredictionConfigVersionError extends Error {
  constructor() {
    super("No prediction config version exists. Create one via POST /api/config before running predictions.");
    this.name = "MissingPredictionConfigVersionError";
  }
}

function readString(problems: string[], envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    problems.push(`${envVar} must be set.`);
  }
  return value ?? "";
}

function readNumberWithDefault(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  if (raw == null || raw === "") {
    return defaultValue;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : defaultValue;
}

function readBoolean(envVar: string, defaultValue: boolean): boolean {
  const raw = process.env[envVar];
  if (raw == null || raw === "") {
    return defaultValue;
  }
  return raw.toLowerCase() === "true";
}

/**
 * Reads every non-versioned prediction model setting from the environment.
 * The tunable weights/thresholds (technicalK, technicalWeight,
 * sentimentWeight, edgeThreshold) are NOT read here — they live in the
 * versioned `prediction_configs` table; use `getActivePredictionConfigVersion`
 * for those.
 */
export function getStaticPredictionConfig(): StaticPredictionConfig {
  const problems: string[] = [];

  const config: StaticPredictionConfig = {
    combinerModel: readString(problems, "OPENAI_COMBINER_MODEL"),
    kellyFraction: readNumberWithDefault("PREDICTION_KELLY_FRACTION", 0.15),
    startingBankrollCents: readNumberWithDefault("PREDICTION_STARTING_BANKROLL_CENTS", 0),
    minContracts: readNumberWithDefault("PREDICTION_MIN_CONTRACTS", 1),
    maxContracts: readNumberWithDefault("PREDICTION_MAX_CONTRACTS", 1000),
    liveTradingEnabled: readBoolean("LIVE_TRADING_ENABLED", false),
  };

  if (problems.length > 0) {
    throw new InvalidPredictionConfigError(problems);
  }

  return config;
}

/**
 * Returns the current (highest-id) prediction config version from the
 * database. Call this once per pipeline run and thread the result through
 * every stage that needs it, so a single prediction is always generated
 * against one consistent config version even if a new version is created
 * mid-run.
 */
export async function getActivePredictionConfigVersion(): Promise<PredictionConfigVersion> {
  const [version] = await db.select().from(predictionConfigs).orderBy(desc(predictionConfigs.id)).limit(1);
  if (!version) {
    throw new MissingPredictionConfigVersionError();
  }
  return version;
}

/** Fetches a specific prediction config version by id, or null if it doesn't exist. */
export async function getPredictionConfigVersionById(id: number): Promise<PredictionConfigVersion | null> {
  const rows = await db.select().from(predictionConfigs).where(eq(predictionConfigs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Lists every prediction config version, newest first. */
export async function listPredictionConfigVersions(): Promise<PredictionConfigVersion[]> {
  return db.select().from(predictionConfigs).orderBy(desc(predictionConfigs.id));
}

/**
 * Creates a new prediction config version. Versions are immutable and
 * append-only — editing config always inserts a new row (auto-incrementing
 * id = version number) rather than updating the previous one, so predictions
 * already attached to an older version stay reproducible.
 */
export async function createPredictionConfigVersion(
  input: NewPredictionConfigVersion,
): Promise<PredictionConfigVersion> {
  const [version] = await db.insert(predictionConfigs).values(input).returning();
  return version;
}

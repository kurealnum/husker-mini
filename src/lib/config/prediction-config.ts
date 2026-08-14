import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictionConfigs, type NewPredictionConfigVersion, type PredictionConfigVersion } from "@/database/schemas";

/** Non-versioned prediction model settings, read from environment variables. */
export interface StaticPredictionConfig {
  /** Fraction of full Kelly to stake on a trade. Defaults to 0.15 (15%). */
  kellyFraction: number;
  /** Minimum contract count for a sized position; sizes below this are treated as no position. */
  minContracts: number;
  /** Maximum contract count for a single sized position. */
  maxContracts: number;
  /**
   * Process-wide live-trading kill switch, read once at worker startup.
   * When false (the default), no league can ever place a live order
   * regardless of its own `tradingMode`. Per-league gating (trading mode,
   * per-league kill switch, backtest requirement) is layered on top of this
   * via `resolveLiveTradingEnabled` — this flag alone is not enough to
   * enable live trading for any league.
   */
  liveTradingEnabled: boolean;
  /**
   * How many cents worse than the scored price the ask may be at order time
   * before the trade is abandoned. Minutes of sports data and LLM calls run
   * between the two, so the book moves; past this budget the edge the model
   * found is gone and the bet isn't the one it decided on. Defaults to 2c.
   */
  maxSlippageCents: number;
}

/** Raised when one or more required prediction config values are missing or invalid. */
export class InvalidPredictionConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid prediction configuration:\n- ${problems.join("\n- ")}`);
    this.name = "InvalidPredictionConfigError";
  }
}

/** Raised when no prediction config version exists for a league yet. */
export class MissingPredictionConfigVersionError extends Error {
  constructor(league: string) {
    super(
      `No prediction config version exists for league "${league}". Create one via POST /api/config before running predictions for it.`,
    );
    this.name = "MissingPredictionConfigVersionError";
  }
}

/**
 * Raised when a config version tries to move a league to `live` trading
 * mode without a backtest result that meets the given threshold. New
 * leagues start in `paper` mode and can only leave it through this gate.
 */
export class BacktestGateNotMetError extends Error {
  constructor(reason: string) {
    super(`Cannot enable live trading mode: ${reason}`);
    this.name = "BacktestGateNotMetError";
  }
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
 * espnWeight, combinerWeight, edgeThreshold) are NOT read here — they live in the
 * versioned `prediction_configs` table; use `getActivePredictionConfigVersion`
 * for those.
 */
export function getStaticPredictionConfig(): StaticPredictionConfig {
  const problems: string[] = [];

  const config: StaticPredictionConfig = {
    kellyFraction: readNumberWithDefault("PREDICTION_KELLY_FRACTION", 0.15),
    minContracts: readNumberWithDefault("PREDICTION_MIN_CONTRACTS", 1),
    maxContracts: readNumberWithDefault("PREDICTION_MAX_CONTRACTS", 1000),
    liveTradingEnabled: readBoolean("LIVE_TRADING_ENABLED", false),
    maxSlippageCents: readNumberWithDefault("PREDICTION_MAX_SLIPPAGE_CENTS", 2),
  };

  if (problems.length > 0) {
    throw new InvalidPredictionConfigError(problems);
  }

  return config;
}

/**
 * Whether the execute_order stage may place a real order for this
 * prediction. Live trading requires ALL of: the process-wide
 * `LIVE_TRADING_ENABLED` env flag, the league's config version being in
 * `live` trading mode, and that league's kill switch being off. Any one of
 * these being false forces paper mode — there is no way to place a live
 * order that skips this check.
 */
export function resolveLiveTradingEnabled(
  staticConfig: StaticPredictionConfig,
  configVersion: PredictionConfigVersion,
): boolean {
  return staticConfig.liveTradingEnabled && configVersion.tradingMode === "live" && !configVersion.killSwitchEnabled;
}

/**
 * Raised when a league's kill switch is on, or the process-wide kill
 * switch is off. Thrown at the start of a pipeline run, before any
 * stage-specific work happens, so a killed league produces no partial
 * predictions — a run for one league failing this way does not affect any
 * other league's config or in-flight predictions.
 */
export class LeagueKillSwitchEnabledError extends Error {
  constructor(league: string) {
    super(`League "${league}" has its kill switch enabled; no new predictions may run for it.`);
    this.name = "LeagueKillSwitchEnabledError";
  }
}

/** Throws `LeagueKillSwitchEnabledError` if this config version's kill switch is on. */
export function assertNotKilled(configVersion: PredictionConfigVersion): void {
  if (configVersion.killSwitchEnabled) {
    throw new LeagueKillSwitchEnabledError(configVersion.league);
  }
}

/**
 * A config version can only be created with `tradingMode: "live"` if a
 * backtest accuracy at or above the given threshold is recorded on it in
 * the same write — never as a later edit, since versions are immutable.
 * `paper` mode (including no backtest at all) is always allowed.
 */
export function assertBacktestGate(input: NewPredictionConfigVersion): void {
  if (input.tradingMode !== "live") return;

  if (input.backtestAccuracy == null || input.backtestThreshold == null) {
    throw new BacktestGateNotMetError(
      "a backtest accuracy and threshold must be recorded on this version before it can be live.",
    );
  }
  if (input.backtestAccuracy < input.backtestThreshold) {
    throw new BacktestGateNotMetError(
      `backtest accuracy ${input.backtestAccuracy} is below the required threshold ${input.backtestThreshold}.`,
    );
  }
}

/**
 * Returns the current (highest-id) prediction config version for a league.
 * Call this once per pipeline run and thread the result through every stage
 * that needs it, so a single prediction is always generated against one
 * consistent config version even if a new version is created mid-run.
 * Config is fully independent per league — creating or editing one
 * league's version never changes what this returns for another.
 */
export async function getActivePredictionConfigVersion(league: string): Promise<PredictionConfigVersion> {
  const [version] = await db
    .select()
    .from(predictionConfigs)
    .where(eq(predictionConfigs.league, league))
    .orderBy(desc(predictionConfigs.id))
    .limit(1);
  if (!version) {
    throw new MissingPredictionConfigVersionError(league);
  }
  return version;
}

/** Fetches a specific prediction config version by id, or null if it doesn't exist. */
export async function getPredictionConfigVersionById(id: number): Promise<PredictionConfigVersion | null> {
  const rows = await db.select().from(predictionConfigs).where(eq(predictionConfigs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Lists every prediction config version for a league, newest first. */
export async function listPredictionConfigVersions(league: string): Promise<PredictionConfigVersion[]> {
  return db
    .select()
    .from(predictionConfigs)
    .where(eq(predictionConfigs.league, league))
    .orderBy(desc(predictionConfigs.id));
}

/** Every league that currently has at least one config version, for populating a league selector. */
export async function listConfiguredLeagues(): Promise<string[]> {
  const rows = await db.selectDistinct({ league: predictionConfigs.league }).from(predictionConfigs);
  return rows.map((r) => r.league).sort();
}

/**
 * Creates a new prediction config version for a league. Versions are
 * immutable and append-only — editing config always inserts a new row
 * (auto-incrementing id = version number) rather than updating the
 * previous one, so predictions already attached to an older version stay
 * reproducible. Enforces the backtest gate: a version cannot be created in
 * `live` mode without a passing backtest result recorded on it.
 */
export async function createPredictionConfigVersion(
  input: NewPredictionConfigVersion,
): Promise<PredictionConfigVersion> {
  assertBacktestGate(input);
  const [version] = await db.insert(predictionConfigs).values(input).returning();
  return version;
}

/** True if the given league+id pair identifies a version scoped to that league (guards cross-league version lookups). */
export async function versionBelongsToLeague(id: number, league: string): Promise<boolean> {
  const rows = await db
    .select({ id: predictionConfigs.id })
    .from(predictionConfigs)
    .where(and(eq(predictionConfigs.id, id), eq(predictionConfigs.league, league)))
    .limit(1);
  return rows.length > 0;
}

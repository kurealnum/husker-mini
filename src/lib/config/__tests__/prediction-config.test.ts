import { describe, expect, it } from "vitest";

import {
  assertBacktestGate,
  assertNotKilled,
  BacktestGateNotMetError,
  LeagueKillSwitchEnabledError,
  resolveLiveTradingEnabled,
  type StaticPredictionConfig,
} from "../prediction-config";
import type { NewPredictionConfigVersion, PredictionConfigVersion } from "@/database/schemas";

const STATIC_CONFIG: StaticPredictionConfig = {
  kellyFraction: 0.15,
  minContracts: 1,
  maxContracts: 1000,
  liveTradingEnabled: true,
  maxSlippageCents: 2,
};

function configVersion(overrides: Partial<PredictionConfigVersion> = {}): PredictionConfigVersion {
  return {
    id: 1,
    league: "nfl",
    tradingMode: "live",
    killSwitchEnabled: false,
    ...overrides,
  } as PredictionConfigVersion;
}

describe("resolveLiveTradingEnabled", () => {
  it("is true only when the process flag is on, trading mode is live, and the kill switch is off", () => {
    expect(resolveLiveTradingEnabled(STATIC_CONFIG, configVersion())).toBe(true);
  });

  it("is false when the process-wide flag is off, regardless of the league's config", () => {
    expect(resolveLiveTradingEnabled({ ...STATIC_CONFIG, liveTradingEnabled: false }, configVersion())).toBe(false);
  });

  it("is false when the league's config is in paper mode", () => {
    expect(resolveLiveTradingEnabled(STATIC_CONFIG, configVersion({ tradingMode: "paper" }))).toBe(false);
  });

  it("is false when the league's kill switch is on, even in live mode", () => {
    expect(resolveLiveTradingEnabled(STATIC_CONFIG, configVersion({ killSwitchEnabled: true }))).toBe(false);
  });
});

describe("assertNotKilled", () => {
  it("does not throw when the kill switch is off", () => {
    expect(() => assertNotKilled(configVersion())).not.toThrow();
  });

  it("throws LeagueKillSwitchEnabledError when the kill switch is on", () => {
    expect(() => assertNotKilled(configVersion({ killSwitchEnabled: true }))).toThrow(LeagueKillSwitchEnabledError);
  });
});

function newVersion(overrides: Partial<NewPredictionConfigVersion> = {}): NewPredictionConfigVersion {
  return {
    league: "nfl",
    technicalK: 1,
    technicalWeight: 0.5,
    espnWeight: 0.3,
    combinerWeight: 0.2,
    edgeThreshold: 0.01,
    combinerModel: "gpt-test",
    tradingMode: "paper",
    ...overrides,
  } as NewPredictionConfigVersion;
}

describe("assertBacktestGate", () => {
  it("allows paper mode with no backtest recorded", () => {
    expect(() => assertBacktestGate(newVersion())).not.toThrow();
  });

  it("rejects live mode with no backtest recorded", () => {
    expect(() => assertBacktestGate(newVersion({ tradingMode: "live" }))).toThrow(BacktestGateNotMetError);
  });

  it("rejects live mode when the backtest accuracy is below its threshold", () => {
    expect(() =>
      assertBacktestGate(newVersion({ tradingMode: "live", backtestAccuracy: 0.5, backtestThreshold: 0.6 })),
    ).toThrow(BacktestGateNotMetError);
  });

  it("allows live mode when the backtest accuracy meets its threshold", () => {
    expect(() =>
      assertBacktestGate(newVersion({ tradingMode: "live", backtestAccuracy: 0.6, backtestThreshold: 0.6 })),
    ).not.toThrow();
  });
});

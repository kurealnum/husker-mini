import { describe, expect, it } from "vitest";

import { extractMarketSnapshot, trackLineMovement, type MarketSnapshot } from "@/lib/analytics/market";
import type { EspnOddsResponse } from "@/lib/espn";

function oddsResponse(overrides: Partial<EspnOddsResponse["items"][number]> = {}): EspnOddsResponse {
  return {
    items: [
      {
        provider: { id: "38", name: "Consensus" },
        details: "HOME -3.5",
        overUnder: 47.5,
        spread: -3.5,
        homeTeamOdds: { moneyLine: -180 },
        awayTeamOdds: { moneyLine: 150 },
        ...overrides,
      },
    ],
  };
}

describe("extractMarketSnapshot", () => {
  it("normalizes an odds response into a snapshot", () => {
    const snapshot = extractMarketSnapshot(oddsResponse(), "2026-01-01T00:00:00Z");
    expect(snapshot).toEqual({
      capturedAt: "2026-01-01T00:00:00Z",
      moneylineHome: -180,
      moneylineAway: 150,
      spread: -3.5,
      total: 47.5,
    });
  });

  it("returns null when there are no odds entries", () => {
    expect(extractMarketSnapshot({ items: [] }, "2026-01-01T00:00:00Z")).toBeNull();
  });

  it("prefers a specific provider when requested", () => {
    const response: EspnOddsResponse = {
      items: [
        {
          provider: { id: "1", name: "A" },
          details: "",
          spread: -1,
        },
        {
          provider: { id: "2", name: "B" },
          details: "",
          spread: -7,
        },
      ],
    };
    const snapshot = extractMarketSnapshot(response, "2026-01-01T00:00:00Z", "2");
    expect(snapshot?.spread).toBe(-7);
  });
});

describe("trackLineMovement", () => {
  const opening: MarketSnapshot = {
    capturedAt: "2026-01-01T00:00:00Z",
    moneylineHome: -150,
    moneylineAway: 130,
    spread: -3,
    total: 45,
  };
  const current: MarketSnapshot = {
    capturedAt: "2026-01-05T00:00:00Z",
    moneylineHome: -180,
    moneylineAway: 150,
    spread: -3.5,
    total: 47.5,
  };

  it("returns null with fewer than two snapshots", () => {
    expect(trackLineMovement([opening])).toBeNull();
  });

  it("computes movement between the earliest and latest snapshots", () => {
    const movement = trackLineMovement([opening, current]);
    expect(movement).toEqual({
      opening,
      current,
      spreadMovement: -0.5,
      totalMovement: 2.5,
      moneylineHomeMovement: -30,
    });
  });

  it("returns null movement fields when a value is missing", () => {
    const missing: MarketSnapshot = { ...current, spread: null };
    const movement = trackLineMovement([opening, missing]);
    expect(movement?.spreadMovement).toBeNull();
  });
});

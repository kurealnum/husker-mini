import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EspnClient } from "@/lib/espn/client";

describe("EspnClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("caches responses within the TTL window", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hello: "world" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EspnClient("https://site.example", "https://core.example", 0);
    const first = await client.getSite("path");
    const second = await client.getSite("path");

    expect(first).toEqual({ hello: "world" });
    expect(second).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EspnClient("https://site.example", "https://core.example", 0);
    const promise = client.getSite("path", { ttlMs: 0 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EspnClient("https://site.example", "https://core.example", 0);
    const promise = client.getSite("path", { ttlMs: 0, maxRetries: 1 });
    const expectation = expect(promise).rejects.toThrow("ESPN API request failed");
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EspnClient("https://site.example", "https://core.example", 0);
    await expect(client.getSite("path", { ttlMs: 0 })).rejects.toThrow(
      "ESPN API request failed (404)",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

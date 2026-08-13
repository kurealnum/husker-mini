"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000;

type Status = "open" | "closed" | "unknown";

/** Small badge showing whether the Kalshi exchange is currently open, polled periodically. */
export function ExchangeStatusBadge() {
  const [status, setStatus] = useState<Status>("unknown");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/exchange-status");
        if (!response.ok) throw new Error("bad response");
        const data = (await response.json()) as { tradingActive: boolean };
        if (!cancelled) setStatus(data.tradingActive ? "open" : "closed");
      } catch {
        if (!cancelled) setStatus("unknown");
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-sm font-medium">
      <span
        className={cn(
          "size-2 rounded-full",
          status === "open" && "bg-green-500",
          status === "closed" && "bg-red-500",
          status === "unknown" && "bg-muted-foreground",
        )}
      />
      <span className="text-muted-foreground">
        Exchange {status === "unknown" ? "status unknown" : status}
      </span>
    </div>
  );
}

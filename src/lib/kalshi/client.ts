import { constants, createSign } from "node:crypto";

/** Raised when Kalshi returns a 404 for an event ticker — the ticker is invalid or unlisted. */
export class KalshiEventNotFoundError extends Error {
  constructor(ticker: string) {
    super(`Kalshi event not found: ${ticker}`);
    this.name = "KalshiEventNotFoundError";
  }
}

/** Raised for any other non-2xx Kalshi API response. */
export class KalshiApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Kalshi API error (${status}): ${message}`);
    this.name = "KalshiApiError";
  }
}

export interface KalshiMarket {
  ticker: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  last_price?: number;
  result?: string;
  [key: string]: unknown;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category?: string;
  status: string;
  [key: string]: unknown;
}

export interface KalshiEventResponse {
  event: KalshiEvent;
  markets: KalshiMarket[];
}

function signRequest(method: string, path: string, timestampMs: string) {
  const keyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_API_PRIVATE_KEY;
  if (!keyId || !privateKey) {
    return null;
  }

  const message = `${timestampMs}${method}${path}`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(
    { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING },
    "base64",
  );

  return { keyId, signature };
}

/** Fetches a Kalshi event, its markets, and current status by event ticker. */
export async function getKalshiEvent(ticker: string): Promise<KalshiEventResponse> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = `/events/${ticker}`;
  const timestampMs = Date.now().toString();
  const signed = signRequest("GET", path, timestampMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (signed) {
    headers["KALSHI-ACCESS-KEY"] = signed.keyId;
    headers["KALSHI-ACCESS-SIGNATURE"] = signed.signature;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
  }

  const response = await fetch(`${baseUrl}${path}?with_nested_markets=true`, { headers });

  if (response.status === 404) {
    throw new KalshiEventNotFoundError(ticker);
  }
  if (!response.ok) {
    throw new KalshiApiError(response.status, await response.text());
  }

  return (await response.json()) as KalshiEventResponse;
}

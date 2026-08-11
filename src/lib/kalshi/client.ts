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

/** Raised when Kalshi rejects an order outright (bad request, invalid params, etc). */
export class KalshiOrderRejectedError extends Error {
  constructor(message: string) {
    super(`Kalshi order rejected: ${message}`);
    this.name = "KalshiOrderRejectedError";
  }
}

/** Raised when the account does not have enough balance to cover the order. */
export class KalshiInsufficientBalanceError extends Error {
  constructor(message: string) {
    super(`Kalshi order failed — insufficient balance: ${message}`);
    this.name = "KalshiInsufficientBalanceError";
  }
}

/** Raised when the target market is closed/settled and can no longer accept orders. */
export class KalshiMarketClosedError extends Error {
  constructor(ticker: string) {
    super(`Kalshi market is closed: ${ticker}`);
    this.name = "KalshiMarketClosedError";
  }
}

export interface KalshiMarket {
  ticker: string;
  status: string;
  yes_ask?: number;
  yes_bid?: number;
  last_price?: number;
  result?: string;
  yes_sub_title?: string;
  [key: string]: unknown;
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category?: string;
  status: string;
  markets: KalshiMarket[];
  [key: string]: unknown;
}

export interface KalshiEventResponse {
  event: KalshiEvent;
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

export type KalshiOrderSide = "yes" | "no";
export type KalshiOrderStatus = "resting" | "executed" | "canceled" | "pending";

export interface PlaceOrderParams {
  ticker: string;
  side: KalshiOrderSide;
  /** Number of contracts to buy. */
  count: number;
  /** Limit price for the given side, in cents (1-99). */
  priceCents: number;
  /**
   * Client-generated idempotency key. Kalshi de-dupes orders sharing the
   * same `client_order_id`, so this should be stable per prediction (e.g.
   * the prediction id) rather than regenerated on every retry.
   */
  clientOrderId: string;
}

export interface PlaceOrderResult {
  orderId: string;
  status: KalshiOrderStatus;
  /** Contracts actually filled so far (0 if fully resting/unfilled). */
  filledCount: number;
  /** Average fill price in cents, or null if nothing has filled yet. */
  averageFillPriceCents: number | null;
}

interface KalshiOrderApiResponse {
  order: {
    order_id: string;
    status: string;
    ticker: string;
    side: KalshiOrderSide;
    yes_price?: number;
    no_price?: number;
    taker_fill_count?: number;
    remaining_count?: number;
    count: number;
    [key: string]: unknown;
  };
}

function toPlaceOrderResult(raw: KalshiOrderApiResponse["order"]): PlaceOrderResult {
  const filledCount = raw.taker_fill_count ?? raw.count - (raw.remaining_count ?? raw.count);
  const priceCents = raw.side === "yes" ? raw.yes_price : raw.no_price;

  return {
    orderId: raw.order_id,
    status: raw.status as KalshiOrderStatus,
    filledCount,
    averageFillPriceCents: filledCount > 0 && typeof priceCents === "number" ? priceCents : null,
  };
}

async function handleOrderErrorResponse(response: Response, ticker: string): Promise<never> {
  const body = await response.text();

  if (response.status === 400) {
    throw new KalshiOrderRejectedError(body);
  }
  if (response.status === 403) {
    throw new KalshiInsufficientBalanceError(body);
  }
  if (response.status === 404 || /market.*(closed|inactive)/i.test(body)) {
    throw new KalshiMarketClosedError(ticker);
  }
  throw new KalshiApiError(response.status, body);
}

/**
 * Places a signed limit order on Kalshi's orders endpoint. Idempotent via
 * `clientOrderId`: retrying with the same key against an order Kalshi has
 * already accepted returns the existing order rather than creating a
 * duplicate.
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = "/portfolio/orders";
  const timestampMs = Date.now().toString();
  const signed = signRequest("POST", path, timestampMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (signed) {
    headers["KALSHI-ACCESS-KEY"] = signed.keyId;
    headers["KALSHI-ACCESS-SIGNATURE"] = signed.signature;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
  }

  const body = {
    ticker: params.ticker,
    client_order_id: params.clientOrderId,
    side: params.side,
    action: "buy",
    count: params.count,
    type: "limit",
    ...(params.side === "yes" ? { yes_price: params.priceCents } : { no_price: params.priceCents }),
  };

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleOrderErrorResponse(response, params.ticker);
  }

  const parsed = (await response.json()) as KalshiOrderApiResponse;
  return toPlaceOrderResult(parsed.order);
}

/** Fetches a previously placed order by id — used to resume a stage after a crash without re-submitting. */
export async function getOrder(orderId: string): Promise<PlaceOrderResult> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = `/portfolio/orders/${orderId}`;
  const timestampMs = Date.now().toString();
  const signed = signRequest("GET", path, timestampMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (signed) {
    headers["KALSHI-ACCESS-KEY"] = signed.keyId;
    headers["KALSHI-ACCESS-SIGNATURE"] = signed.signature;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
  }

  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new KalshiApiError(response.status, await response.text());
  }

  const parsed = (await response.json()) as KalshiOrderApiResponse;
  return toPlaceOrderResult(parsed.order);
}

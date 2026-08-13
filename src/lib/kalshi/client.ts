import { constants, createSign } from "node:crypto";

const REQUEST_TIMEOUT_MS = 10_000;

/** Raised when a Kalshi request doesn't complete within REQUEST_TIMEOUT_MS. */
export class KalshiTimeoutError extends Error {
  constructor(path: string) {
    super(`Kalshi API request timed out: ${path}`);
    this.name = "KalshiTimeoutError";
  }
}

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
  /** Dollar-scale strings (e.g. "0.6700"), not cent integers. */
  yes_ask_dollars?: string;
  yes_bid_dollars?: string;
  last_price_dollars?: string;
  /** Contracts actually available at yes_ask_dollars/yes_bid_dollars — a quote with 0 size isn't real liquidity. */
  yes_ask_size_fp?: string;
  yes_bid_size_fp?: string;
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

/**
 * Kalshi requires the signed message to include the full request path, not
 * just the part after the base URL — e.g. `/trade-api/v2/portfolio/balance`,
 * not `/portfolio/balance`, when KALSHI_API_BASE_URL is
 * `https://.../trade-api/v2`.
 */
function fullSignedPath(path: string): string {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  const basePath = baseUrl ? new URL(baseUrl).pathname.replace(/\/$/, "") : "";
  return `${basePath}${path}`;
}

function signRequest(method: string, path: string, timestampMs: string) {
  const keyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_API_PRIVATE_KEY;
  if (!keyId || !privateKey) {
    return null;
  }

  const message = `${timestampMs}${method}${fullSignedPath(path)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(
    { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING },
    "base64",
  );

  return { keyId, signature };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new KalshiTimeoutError(url);
    }
    throw error;
  }
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

  const response = await fetchWithTimeout(`${baseUrl}${path}?with_nested_markets=true`, {
    headers,
  });

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

/** V2 create-order response — counts/prices are fixed-point dollar strings, not cent integers. */
interface KalshiCreateOrderV2Response {
  order_id: string;
  client_order_id: string;
  fill_count: string;
  remaining_count: string;
  average_fill_price?: string;
  average_fee_paid?: string;
  ts_ms: number;
}

/** V2 get-order response, from GET /portfolio/orders/{order_id}. */
interface KalshiGetOrderV2Response {
  order: {
    order_id: string;
    status: KalshiOrderStatus;
    outcome_side: KalshiOrderSide;
    fill_count_fp: string;
    remaining_count_fp: string;
    initial_count_fp: string;
    yes_price_dollars: string;
    no_price_dollars: string;
    [key: string]: unknown;
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
 * Places a signed limit order on Kalshi's V2 orders endpoint. Idempotent via
 * `clientOrderId`: retrying with the same key against an order Kalshi has
 * already accepted returns the existing order rather than creating a
 * duplicate.
 *
 * V2 uses bid/ask instead of yes/no ("bid" = buy YES, "ask" = sell YES) and
 * fixed-point dollar strings instead of cent integers for count/price.
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = "/portfolio/events/orders";
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

  // Buying "no" is equivalent to selling "yes": side=ask at the complementary
  // price. Both sides here already represent a YES-leg limit price in cents.
  const body = {
    ticker: params.ticker,
    client_order_id: params.clientOrderId,
    side: params.side === "yes" ? "bid" : "ask",
    count: params.count.toFixed(2),
    price: (params.priceCents / 100).toFixed(4),
    // GTC (not IOC) to preserve the original behavior of resting unfilled
    // size at the limit price rather than canceling it immediately.
    time_in_force: "good_till_canceled",
    self_trade_prevention_type: "taker_at_cross",
  };

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleOrderErrorResponse(response, params.ticker);
  }

  const parsed = (await response.json()) as KalshiCreateOrderV2Response;
  const filledCount = Math.round(Number(parsed.fill_count));
  const remainingCount = Math.round(Number(parsed.remaining_count));

  return {
    orderId: parsed.order_id,
    // The create-order response has no status field: any unfilled remainder
    // is still resting at the limit price (GTC), fully filled is executed.
    status: remainingCount > 0 ? "resting" : "executed",
    filledCount,
    averageFillPriceCents:
      filledCount > 0 && parsed.average_fill_price != null
        ? Math.round(Number(parsed.average_fill_price) * 100)
        : null,
  };
}

interface KalshiBalanceApiResponse {
  balance: number;
  [key: string]: unknown;
}

/** Fetches the account's available cash balance, in cents, from Kalshi's portfolio endpoint. */
export async function getBalance(): Promise<number> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = "/portfolio/balance";
  const timestampMs = Date.now().toString();
  const signed = signRequest("GET", path, timestampMs);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (signed) {
    headers["KALSHI-ACCESS-KEY"] = signed.keyId;
    headers["KALSHI-ACCESS-SIGNATURE"] = signed.signature;
    headers["KALSHI-ACCESS-TIMESTAMP"] = timestampMs;
  }

  const response = await fetchWithTimeout(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new KalshiApiError(response.status, await response.text());
  }

  const parsed = (await response.json()) as KalshiBalanceApiResponse;
  return parsed.balance;
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

  const response = await fetchWithTimeout(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new KalshiApiError(response.status, await response.text());
  }

  const parsed = (await response.json()) as KalshiGetOrderV2Response;
  const order = parsed.order;
  const filledCount = Math.round(Number(order.fill_count_fp));
  const priceDollars = order.outcome_side === "yes" ? order.yes_price_dollars : order.no_price_dollars;

  return {
    orderId: order.order_id,
    status: order.status,
    filledCount,
    averageFillPriceCents:
      filledCount > 0 && priceDollars != null ? Math.round(Number(priceDollars) * 100) : null,
  };
}

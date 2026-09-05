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
  constructor(ticker: string, detail?: string) {
    super(`Kalshi market is closed: ${ticker}${detail ? ` — ${detail}` : ""}`);
    this.name = "KalshiMarketClosedError";
  }
}

/**
 * Raised when Kalshi 404s an order request. Usually a bad ticker — most often
 * an event ticker where a market ticker was required — but a wrong endpoint
 * path 404s the same way, so the response body is kept in the message.
 */
export class KalshiMarketNotFoundError extends Error {
  constructor(ticker: string, detail: string) {
    super(`Kalshi market not found: ${ticker} — ${detail}`);
    this.name = "KalshiMarketNotFoundError";
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

/**
 * The price a buy of this market's YES leg can actually cross right now, in
 * dollars, or null when nothing is for sale.
 *
 * Only the ask counts. The bid is what other buyers offer and the last price is
 * history — a buy limit at either one crosses nothing and rests (or, under IOC,
 * is canceled outright). An ask quote with zero size is a placeholder, not
 * liquidity, so it doesn't count either.
 */
export function executableYesAskDollars(market: KalshiMarket): number | null {
  const size = Number(market.yes_ask_size_fp ?? "0");
  const ask = Number(market.yes_ask_dollars);

  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }
  if (!Number.isFinite(ask) || ask <= 0) {
    return null;
  }

  return ask;
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
  /**
   * Market ticker — the per-team leg, e.g. "KXMLBGAME-…-CLE". Never the event
   * ticker: Kalshi 404s those, which reads as a missing market.
   */
  ticker: string;
  /** Number of contracts to buy. */
  count: number;
  /** Limit price for this market's YES leg, in cents (1-99). */
  priceCents: number;
  /**
   * Client-generated idempotency key. Kalshi de-dupes orders sharing the same
   * `client_order_id`, so this must be stable across retries of one attempt —
   * that's what makes a crash between submit and persist safe — but distinct
   * per new attempt, or a resubmit is de-duped back to the previous (possibly
   * canceled) order instead of placing a new one.
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

/**
 * V2 create-order response — counts/prices are fixed-point dollar strings, not
 * cent integers. The docs spell the counts without the `_fp` suffix while the
 * live API returns them with it, so both spellings are read.
 */
interface KalshiCreateOrderV2Response {
  order_id: string;
  client_order_id: string;
  fill_count_fp?: string;
  fill_count?: string;
  remaining_count_fp?: string;
  remaining_count?: string;
  average_fill_price?: string;
  average_fee_paid?: string;
  ts_ms?: number;
}

/**
 * V2 get-order response, from GET /portfolio/orders/{order_id}. `yes_price`/
 * `no_price` are the order's limit price, not what it filled at — never use
 * them for `averageFillPriceCents`. `average_fill_price` (present once
 * something has filled, same field name as the create-order response) or
 * `taker_fill_cost_dollars` (total cost of taker fills, divided by fill
 * count) are the actual fill price.
 */
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
    average_fill_price?: string;
    taker_fill_cost_dollars?: string;
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
  // Checked before the status code: a closed market can be reported as a 404,
  // and "closed" is the more specific diagnosis. A 404 without that marker is
  // a missing market (or a wrong path), which is a different bug entirely.
  if (/market.*(closed|inactive)/i.test(body)) {
    throw new KalshiMarketClosedError(ticker, body);
  }
  if (response.status === 404) {
    throw new KalshiMarketNotFoundError(ticker, body);
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
 *
 * Only buys the YES leg of `ticker`. Buying NO is the same trade as buying YES
 * on the event's other market, so callers route a "no" bet there rather than
 * sending an ask — an ask is a *sell*, which needs a position the account
 * doesn't hold.
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

  const body = {
    ticker: params.ticker,
    client_order_id: params.clientOrderId,
    side: "bid",
    count: params.count.toFixed(2),
    price: (params.priceCents / 100).toFixed(4),
    // IOC: fill what crosses right now, cancel the rest. GTC left unfilled
    // orders resting on the book indefinitely while the pipeline recorded the
    // prediction as failed — a live position nothing in this codebase tracked
    // or cancels. IOC trades fills away for that safety, so a stale limit
    // price now means a missed bet instead of an orphaned order.
    //
    // The caller now prices against the ask read at execution time, so an IOC
    // order crosses whenever the size is there.
    //
    // TODO: to also catch fills the ask can't reach — rest a GTC order, poll it
    // for a bounded window, then cancel the remainder. Needs a cancel-order
    // call, which this client doesn't have yet.
    time_in_force: "immediate_or_cancel",
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
  const rawFillCount = Number(parsed.fill_count_fp ?? parsed.fill_count);

  // Guarded rather than allowed to become NaN: NaN fails every comparison
  // below, which would report an unfilled order as fully executed.
  if (!Number.isFinite(rawFillCount)) {
    throw new KalshiApiError(
      response.status,
      `create-order response has no readable fill count: ${JSON.stringify(parsed)}`,
    );
  }

  const filledCount = Math.round(rawFillCount);

  return {
    orderId: parsed.order_id,
    // The create-order response has no status field, and `remaining_count`
    // can't stand in for one: Kalshi zeroes it once IOC cancels the unfilled
    // size, so a completely unfilled order and a completely filled one both
    // report 0 remaining. The requested count is the only reliable baseline.
    // A partial fill reports "canceled" — `filledCount` carries the size.
    status: filledCount >= params.count ? "executed" : "canceled",
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

interface KalshiExchangeStatusApiResponse {
  exchange_active: boolean;
  trading_active: boolean;
  [key: string]: unknown;
}

export interface KalshiExchangeStatus {
  exchangeActive: boolean;
  tradingActive: boolean;
}

/** Fetches whether the Kalshi exchange is currently open for trading. */
export async function getExchangeStatus(): Promise<KalshiExchangeStatus> {
  const baseUrl = process.env.KALSHI_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("KALSHI_API_BASE_URL is not configured.");
  }

  const path = "/exchange/status";
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

  const parsed = (await response.json()) as KalshiExchangeStatusApiResponse;
  return { exchangeActive: parsed.exchange_active, tradingActive: parsed.trading_active };
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

  // Never yes_price_dollars/no_price_dollars — those are the order's limit
  // price, not what it actually filled at.
  let averageFillPriceCents: number | null = null;
  if (filledCount > 0) {
    if (order.average_fill_price != null) {
      averageFillPriceCents = Math.round(Number(order.average_fill_price) * 100);
    } else if (order.taker_fill_cost_dollars != null) {
      averageFillPriceCents = Math.round((Number(order.taker_fill_cost_dollars) / filledCount) * 100);
    }
  }

  return {
    orderId: order.order_id,
    status: order.status,
    filledCount,
    averageFillPriceCents,
  };
}

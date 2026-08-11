import { isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { predictions } from "@/database/schemas";

/**
 * Available trading bankroll, tracked locally rather than pulled live from
 * Kalshi's balance endpoint: starting bankroll (configured) plus realized
 * P&L from every settled prediction. This avoids an extra signed API call
 * per prediction and stays correct across paper/live mode switches, since
 * paper trades never accrue `pnlCents` in the first place.
 */
export async function getAvailableBankrollCents(startingBankrollCents: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${predictions.pnlCents}), 0)` })
    .from(predictions)
    .where(isNotNull(predictions.pnlCents));

  const realizedPnlCents = Number(row?.total ?? 0);
  return startingBankrollCents + realizedPnlCents;
}

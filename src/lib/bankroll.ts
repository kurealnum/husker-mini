import { getBalance } from "@/lib/kalshi/client";

/** Available trading bankroll, pulled live from Kalshi's account balance endpoint. */
export async function getAvailableBankrollCents(): Promise<number> {
  return getBalance();
}

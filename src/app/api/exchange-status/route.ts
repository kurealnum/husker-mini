import { NextResponse } from "next/server";

import { getExchangeStatus } from "@/lib/kalshi/client";

export async function GET() {
  try {
    const status = await getExchangeStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

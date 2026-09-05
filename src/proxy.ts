import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isRateLimited } from "@/lib/rate-limit";

const PREDICTIONS_POST_LIMIT = 20;
const PREDICTIONS_POST_WINDOW_MS = 60_000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(request: NextRequest): boolean {
  const expectedUser = process.env.APP_BASIC_AUTH_USER;
  const expectedPassword = process.env.APP_BASIC_AUTH_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return timingSafeEqual(user, expectedUser) && timingSafeEqual(password, expectedPassword);
}

function unauthorizedResponse(request: NextRequest) {
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  if (isApiRequest) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="husker-mini"' },
  });
}

/**
 * Blocks every request that isn't authenticated with the shared HTTP Basic
 * Auth credentials, and rate-limits POST /api/predictions per client IP so
 * one caller can't queue unbounded jobs (each queued job can place a real
 * order once the prediction worker picks it up).
 */
export function proxy(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse(request);
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/api/predictions" && request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`predictions:${ip}`, PREDICTIONS_POST_LIMIT, PREDICTIONS_POST_WINDOW_MS)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

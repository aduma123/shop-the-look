import type { IncomingMessage } from "node:http";

// Limits on /api/analyze, kept in memory (they reset when the server restarts).
// Override with environment variables on the host.
const PER_IP_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR ?? 10);
const DAILY_TOTAL = Number(process.env.DAILY_LIMIT ?? 200);

const HOUR = 60 * 60 * 1000;

const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export type LimitResult = { ok: true } | { ok: false; error: string; retryAfterSeconds: number };

/**
 * The visitor's IP. Behind a host's proxy (Render, Railway, Fly) the socket address is the
 * proxy, so the first X-Forwarded-For entry is used. A client can fake that header, which is
 * why the daily total below is the hard cap on spend; the per-IP limit is a fairness limit.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** Records one analysis for this IP, or refuses it when a limit is reached. */
export function takeAnalysis(ip: string, now = Date.now()): LimitResult {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_TOTAL) {
    const midnight = Date.parse(`${today}T00:00:00Z`) + 24 * HOUR;
    return {
      ok: false,
      error: "Shop the Look has reached today's limit. Please come back tomorrow.",
      retryAfterSeconds: Math.ceil((midnight - now) / 1000),
    };
  }

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_IP_PER_HOUR) {
    hits.set(ip, recent);
    return {
      ok: false,
      error: `You can analyze ${PER_IP_PER_HOUR} looks per hour. Please try again later.`,
      retryAfterSeconds: Math.ceil((recent[0] + HOUR - now) / 1000),
    };
  }

  recent.push(now);
  hits.set(ip, recent);
  dayCount++;
  return { ok: true };
}

// Drop IPs with no hits in the last hour so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (times.every((t) => now - t >= HOUR)) hits.delete(ip);
  }
}, 10 * 60 * 1000).unref();

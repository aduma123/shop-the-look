import type { IncomingMessage, ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { analyzeLook, AnalyzeError, type ImageMediaType } from "./analyze.ts";
import { clientIp, takeAnalysis } from "./rateLimit.ts";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/;

// Load ANTHROPIC_API_KEY from .env when present; variables already set in the shell win.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

let client: Anthropic | undefined;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AnalyzeError("Image is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Sites allowed to call this API from another domain, e.g. the static frontend:
// ALLOWED_ORIGINS=https://shop-the-look-web.onrender.com (comma-separated for several).
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

function applyCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Vary", "Origin");
}

/**
 * Handles GET /health and POST /api/analyze. Returns false when the request is not for
 * these routes.
 */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = req.url?.split("?")[0] ?? "";
  if (path !== "/health" && path !== "/api/analyze") return false;

  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // Used by the frontend to wake the server early, and by hosts as a health check.
  if (path === "/health") {
    res.setHeader("Cache-Control", "no-store");
    send(res, 200, { ok: true });
    return true;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }

  try {
    const { image } = JSON.parse(await readBody(req)) as { image?: string };
    const match = typeof image === "string" ? DATA_URL.exec(image) : null;
    if (!match) {
      send(res, 400, { error: "Upload a JPEG, PNG, GIF or WebP image." });
      return true;
    }
    const limit = takeAnalysis(clientIp(req));
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      send(res, 429, { error: limit.error });
      return true;
    }
    client ??= new Anthropic();
    const look = await analyzeLook(client, match[2], match[1] as ImageMediaType);
    send(res, 200, look);
  } catch (err) {
    if (err instanceof AnalyzeError) {
      send(res, 422, { error: err.message });
    } else if (err instanceof SyntaxError) {
      send(res, 400, { error: "Invalid request body." });
    } else if (err instanceof Anthropic.AuthenticationError) {
      send(res, 500, { error: "Server is missing a valid ANTHROPIC_API_KEY." });
    } else if (err instanceof Anthropic.RateLimitError) {
      send(res, 429, { error: "Too many requests. Please wait a moment and try again." });
    } else if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      send(res, 502, { error: "The analysis service failed. Please try again." });
    } else {
      console.error(err);
      send(res, 500, { error: "Something went wrong." });
    }
  }
  return true;
}

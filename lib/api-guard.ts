// CORS allow-listing + a best-effort in-memory rate limiter for the public
// chat endpoint (so it's safe to embed on handzon.no via a <script> snippet).

const DEFAULT_ORIGINS = [
  "https://handzon.no",
  "https://www.handzon.no",
];

function allowedOrigins(): string[] {
  const extra = (process.env.CHAT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

/** True for handzon.no origins, any localhost (dev/test), or configured extras. */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch {
    /* malformed origin */
  }
  return false;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  // Reflect the origin only when allow-listed; otherwise no CORS grant.
  const h: Record<string, string> = {
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    h["Access-Control-Allow-Origin"] = origin as string;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

// ---- Rate limiting (per IP, sliding window, per warm instance) ----
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - arr[0])) / 1000);
    hits.set(ip, arr);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  hits.set(ip, arr);
  // opportunistic cleanup so the map doesn't grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

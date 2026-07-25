import { createServiceClient } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/google-calendar";
import { list } from "@vercel/blob";

// Live health probes for every external service the product depends on.
//
// Why this exists: when the phone went dead on 2026-07-25 we had no way to ask
// "is it us, our config, or the vendor?" and burned an afternoon guessing. So
// each probe answers that question directly, and the four states are chosen to
// keep those causes apart:
//
//   ok           — reachable and authenticated
//   degraded     — works, but something will bite soon (slow, low balance)
//   down         — reachable but failing, OR our key was rejected
//   unconfigured — the env var isn't set at all
//
// `unconfigured` is deliberately NOT `down`. A missing TELNYX_API_KEY is a
// two-minute fix in Vercel; a Telnyx outage is a coffee break. Showing both as
// a red dot would send you to the wrong place — which is exactly the mistake
// that cost us time.
//
// Probes are read-only and free: no tokens are spent, no bookings made, no
// messages sent. Nothing here ever returns key material — only status codes,
// latencies and counts, because this renders in a browser.

/** One probe may not hold the page hostage. */
const TIMEOUT_MS = 6000;
/** Above this a service is "working, but you'll feel it". */
const SLOW_MS = 2000;
/** Telnyx stops accepting calls at zero. A dead phone line with no explanation
 *  is precisely the failure we couldn't diagnose, so warn before it happens. */
const LOW_BALANCE = 10;

export type CheckState = "ok" | "degraded" | "down" | "unconfigured";

export type CheckResult = {
  id: string;
  name: string;
  /** What actually stops working for a customer when this is down. The point
   *  of the page is triage, and triage needs consequences, not just colors. */
  impact: string;
  state: CheckState;
  latencyMs: number | null;
  detail?: string;
};

type ProbeOutcome = { state: Exclude<CheckState, "unconfigured">; detail?: string };

type CheckDef = {
  id: string;
  name: string;
  impact: string;
  /** Missing any of these => unconfigured, and the probe is skipped. */
  requires: string[];
  probe: () => Promise<ProbeOutcome>;
};

/** Shared HTTP probe. A 401/403 means OUR key is wrong, not that the vendor is
 *  down — saying which saves a trip to the wrong status page. */
async function httpProbe(url: string, headers: Record<string, string>): Promise<ProbeOutcome> {
  const res = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return { state: "ok" };
  if (res.status === 401 || res.status === 403) {
    return { state: "down", detail: `nøkkelen ble avvist (${res.status})` };
  }
  return { state: "down", detail: `HTTP ${res.status}` };
}

const CHECKS: CheckDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    impact: "Hanz slutter å svare — både på telefon og i nettpraten.",
    requires: ["OPENAI_API_KEY"],
    probe: () =>
      httpProbe("https://api.openai.com/v1/models", {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      }),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    impact: "Chat-boten på kundenes nettsider slutter å svare.",
    requires: ["ANTHROPIC_API_KEY"],
    probe: () =>
      httpProbe("https://api.anthropic.com/v1/models", {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      }),
  },
  {
    id: "telnyx",
    name: "Telnyx",
    impact: "Telefonnummeret slutter å ta imot samtaler.",
    requires: ["TELNYX_API_KEY"],
    probe: async () => {
      const res = await fetch("https://api.telnyx.com/v2/balance", {
        headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 || res.status === 403) {
        return { state: "down", detail: `nøkkelen ble avvist (${res.status})` };
      }
      if (!res.ok) return { state: "down", detail: `HTTP ${res.status}` };

      // Balance is the whole reason we probe this endpoint rather than a
      // cheaper one: it is the failure that looks like an outage from outside.
      const body = (await res.json().catch(() => null)) as
        | { data?: { balance?: string; currency?: string } }
        | null;
      const balance = Number(body?.data?.balance);
      const currency = body?.data?.currency ?? "";
      if (!Number.isFinite(balance)) return { state: "ok" };
      const shown = `saldo ${balance.toFixed(2)} ${currency}`.trim();
      return balance < LOW_BALANCE
        ? { state: "degraded", detail: `${shown} — fyll på før nummeret stopper` }
        : { state: "ok", detail: shown };
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    impact: "Innlogging, kunder, bookinger og agent-promptene blir utilgjengelige.",
    requires: ["SUPABASE_URL", "SUPABASE_SECRET_KEY"],
    probe: async () => {
      const { error } = await createServiceClient().from("clients").select("id").limit(1);
      return error ? { state: "down", detail: error.message.slice(0, 120) } : { state: "ok" };
    },
  },
  {
    id: "blob",
    name: "Vercel Blob",
    impact: "Samtaleopptak, innstillinger og ledige timer kan ikke leses eller lagres.",
    requires: ["BLOB_READ_WRITE_TOKEN"],
    probe: async () => {
      await list({ limit: 1 });
      return { state: "ok" };
    },
  },
  {
    id: "google",
    name: "Google Calendar",
    impact: "Booking mot kundens kalender slutter å virke.",
    requires: ["GOOGLE_SERVICE_ACCOUNT_KEY"],
    probe: async () => {
      // Minting the token proves key + signature + Google's acceptance without
      // reading anyone's calendar. Cached tokens make this near-instant, which
      // is honest: the cached path is the one bookings actually use.
      await getAccessToken();
      return { state: "ok" };
    },
  },
  {
    id: "resend",
    name: "Resend",
    impact: "Bookingbekreftelser på e-post blir ikke sendt.",
    requires: ["RESEND_API_KEY"],
    probe: () =>
      httpProbe("https://api.resend.com/domains", {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      }),
  },
];

async function runOne(def: CheckDef): Promise<CheckResult> {
  const missing = def.requires.filter((key) => !process.env[key]);
  if (missing.length) {
    return {
      id: def.id,
      name: def.name,
      impact: def.impact,
      state: "unconfigured",
      latencyMs: null,
      detail: `mangler ${missing.join(", ")}`,
    };
  }

  const startedAt = Date.now();
  try {
    // A probe that ignores its own AbortSignal (or hangs before the fetch)
    // must still not stall the page, so the timeout is enforced out here too.
    const outcome = await Promise.race([
      def.probe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS + 500),
      ),
    ]);
    const latencyMs = Date.now() - startedAt;
    // Slow but working still counts as a warning: this is the shape trouble
    // usually takes before it becomes an outage.
    const state = outcome.state === "ok" && latencyMs > SLOW_MS ? "degraded" : outcome.state;
    const detail =
      state === "degraded" && outcome.state === "ok" ? `treg (${latencyMs} ms)` : outcome.detail;
    return { id: def.id, name: def.name, impact: def.impact, state, latencyMs, detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      id: def.id,
      name: def.name,
      impact: def.impact,
      state: "down",
      latencyMs: Date.now() - startedAt,
      // Vendor errors can carry request ids and worse; truncate rather than
      // paste an unbounded string into the page.
      detail: message.slice(0, 120),
    };
  }
}

/** Runs every probe in parallel. Never rejects — a status page that throws
 *  because a dependency is down is the one page that must not do that. */
export async function runStatusChecks(): Promise<CheckResult[]> {
  return Promise.all(CHECKS.map(runOne));
}

/** Worst state across all checks, for the page's headline. */
export function overallState(results: CheckResult[]): CheckState {
  if (results.some((r) => r.state === "down")) return "down";
  if (results.some((r) => r.state === "degraded")) return "degraded";
  if (results.some((r) => r.state === "unconfigured")) return "unconfigured";
  return "ok";
}

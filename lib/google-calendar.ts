import crypto from "crypto";

/**
 * Minimal Google Calendar client authenticated as a service account.
 * The store shares their booking calendar with the service-account email
 * ("Make changes to events") — no OAuth consent flow, no expiring tokens.
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_KEY = the service-account JSON key file,
 * either raw JSON or base64-encoded.
 */

type ServiceAccount = { client_email: string; private_key: string };

export function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    if (parsed.client_email && parsed.private_key) {
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    }
    return null;
  } catch {
    return null;
  }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const sa = getServiceAccount();
  if (!sa) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY er ikke konfigurert");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(sa.private_key)
    .toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token-feil ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

const CAL = "https://www.googleapis.com/calendar/v3";

async function gcal(method: string, path: string, body?: unknown) {
  const token = await getAccessToken();
  const res = await fetch(`${CAL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google Calendar ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export type GcalEvent = {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export async function listEvents(
  calendarId: string,
  timeMinISO: string,
  timeMaxISO: string
): Promise<GcalEvent[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    maxResults: "250",
  });
  const data = await gcal(
    "GET",
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  );
  return (data.items ?? []) as GcalEvent[];
}

export async function insertEvent(
  calendarId: string,
  event: Record<string, unknown>
): Promise<GcalEvent> {
  return gcal("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, event);
}

/** Verifies access by fetching calendar metadata. Returns the calendar name. */
export async function testCalendarAccess(calendarId: string): Promise<string> {
  const data = await gcal("GET", `/calendars/${encodeURIComponent(calendarId)}`);
  return data.summary ?? calendarId;
}

/** Converts a local Europe/Oslo date+time to a UTC Date (DST-safe). */
export function osloToUTC(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(guess).map((p) => [p.type, p.value])
  );
  const asIfUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = asIfUTC - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** Break a UTC/ISO timestamp into Europe/Oslo local date (YYYY-MM-DD) + HH:MM. */
export function osloParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

/** Today's date (YYYY-MM-DD) in Europe/Oslo. */
export function osloToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

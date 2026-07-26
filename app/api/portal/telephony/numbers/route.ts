// Admin API for wiring Telnyx numbers to clients from the Integrasjoner
// page. GET lists the account's numbers with their assignments; POST
// assigns/unassigns and (best-effort) points the number at the same TeXML
// connection the working default line uses, so inbound calls actually reach
// our webhook.
//
// Admin-only: this reads the Telnyx account and changes call routing.

import { getProfile, getClients } from "@/lib/portal/data";
import { DEFAULT_PHONE_NUMBER, PHONE_CLIENT_ID } from "@/lib/telephony/config";
import {
  assignNumber,
  loadAssignments,
  normalizeNumber,
  unassignClient,
} from "@/lib/telephony/numbers";
import { listPhoneNumbers, setNumberConnection, telnyxConfigured } from "@/lib/telephony/telnyxNumbers";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getProfile();
  return profile?.role === "admin";
}

/** The default line's assignment is implicit (PHONE_CLIENT_ID fallback), so
 *  surface it as taken even when the mapping has no row for it. */
function effectiveAssignments(map: Record<string, string>): Record<string, string> {
  const defaultNum = normalizeNumber(DEFAULT_PHONE_NUMBER);
  if (map[defaultNum]) return map;
  return { ...map, [defaultNum]: PHONE_CLIENT_ID };
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });
  const clientId = new URL(req.url).searchParams.get("client");
  if (!clientId) return Response.json({ error: "missing_client" }, { status: 400 });

  if (!telnyxConfigured()) {
    return Response.json({ configured: false, numbers: [], assignedNumber: null });
  }

  const [numbers, map, clients] = await Promise.all([
    listPhoneNumbers().catch((e) => {
      throw new Error(`Kunne ikke hente numre fra Telnyx: ${e instanceof Error ? e.message : e}`);
    }),
    loadAssignments(),
    getClients(),
  ]);
  const assignments = effectiveAssignments(map);
  const nameOf = (cid: string) => clients.find((c) => c.id === cid)?.name ?? "ukjent kunde";

  const rows = numbers.map((n) => {
    const assignedTo = assignments[normalizeNumber(n.phone_number)] ?? null;
    return {
      phoneNumber: n.phone_number,
      status: n.status ?? "",
      connectionName: n.connection_name ?? null,
      assignedClientId: assignedTo,
      assignedClientName: assignedTo ? nameOf(assignedTo) : null,
    };
  });

  const mine = Object.entries(assignments).find(([, cid]) => cid === clientId)?.[0] ?? null;
  return Response.json({
    configured: true,
    assignedNumber: mine,
    numbers: rows,
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.clientId !== "string") {
    return Response.json({ error: "missing_client" }, { status: 400 });
  }

  if (body.disconnect) {
    await unassignClient(body.clientId);
    return Response.json({ ok: true, assignedNumber: null });
  }

  if (!telnyxConfigured()) {
    return Response.json({ error: "TELNYX_API_KEY er ikke satt på serveren." }, { status: 500 });
  }
  const rawNumber = String(body.number ?? "").trim();
  if (!rawNumber) return Response.json({ error: "Velg et nummer." }, { status: 400 });
  const number = normalizeNumber(rawNumber);

  // The number must exist on OUR Telnyx account — this route wires numbers,
  // it doesn't take ownership claims on faith.
  const numbers = await listPhoneNumbers();
  const target = numbers.find((n) => normalizeNumber(n.phone_number) === number);
  if (!target) {
    return Response.json(
      { error: "Nummeret finnes ikke på Telnyx-kontoen. Kjøp det i Telnyx-portalen først." },
      { status: 400 },
    );
  }

  // One number, one client. Assigning someone else's line must be a
  // deliberate two-step (disconnect there first), not a silent takeover.
  const assignments = effectiveAssignments(await loadAssignments());
  const takenBy = assignments[number];
  if (takenBy && takenBy !== body.clientId) {
    const clients = await getClients();
    const name = clients.find((c) => c.id === takenBy)?.name ?? takenBy;
    return Response.json(
      { error: `Nummeret er allerede koblet til ${name}. Koble det fra der først.` },
      { status: 409 },
    );
  }

  // Best-effort: point the number at the TeXML connection the default line
  // uses, so calls reach our webhook. The default line is the reference
  // because it is the one wiring we KNOW works. If we can't (default line
  // missing from the account, PATCH rejected), the assignment still saves —
  // the admin just has to set the connection in the Telnyx portal, and the
  // response says so instead of pretending.
  let connectionWarning: string | null = null;
  const reference = numbers.find(
    (n) => normalizeNumber(n.phone_number) === normalizeNumber(DEFAULT_PHONE_NUMBER),
  );
  if (!reference?.connection_id) {
    connectionWarning =
      "Fant ikke referanselinjens TeXML-oppsett — sett nummerets connection til TeXML-appen manuelt i Telnyx-portalen.";
  } else if (target.connection_id !== reference.connection_id) {
    try {
      await setNumberConnection(target.id, reference.connection_id);
    } catch (e) {
      connectionWarning = `Klarte ikke å sette TeXML-oppsettet automatisk (${e instanceof Error ? e.message.slice(0, 120) : "ukjent feil"}) — sett connection manuelt i Telnyx-portalen.`;
    }
  }

  await assignNumber(number, body.clientId);
  return Response.json({
    ok: true,
    assignedNumber: number,
    // Blob overwrite cache: the routing map can take ~1 min to go live.
    note: "Koblingen er lagret. Det kan ta opptil ett minutt før innkommende samtaler rutes til denne kunden.",
    connectionWarning,
  });
}

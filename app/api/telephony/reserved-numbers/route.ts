// Which phone numbers are IN CUSTOMER SERVICE — the list the cold-outreach
// dialer (separate app: holter-holdings-outreach) must never dial out from.
// Source of truth is the same number->client map that routes inbound calls,
// plus the default line, so the two systems can never disagree.
//
// Auth: a shared secret header, because the caller is a sibling server (no
// portal session to lean on). Fails CLOSED when the secret isn't configured —
// an open endpoint that silently returns [] would let the dialer conclude
// every number is free, which is the exact accident this exists to prevent.

import { DEFAULT_PHONE_NUMBER } from "@/lib/telephony/config";
import { loadAssignments, normalizeNumber } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.OUTREACH_SHARED_SECRET;
  if (!secret) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-outreach-secret");
  if (provided !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const map = await loadAssignments();
  const reserved = new Set(Object.keys(map));
  reserved.add(normalizeNumber(DEFAULT_PHONE_NUMBER));

  // Digits-only, matching lib/telephony/numbers normalization. The consumer
  // must normalize its side the same way before comparing.
  return Response.json({ reserved: [...reserved].sort() });
}

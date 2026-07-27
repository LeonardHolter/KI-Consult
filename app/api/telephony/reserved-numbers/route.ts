// Which phone numbers are IN CUSTOMER SERVICE — the list the cold-outreach
// dialer (separate app: holter-holdings-outreach) must never dial out from.
// Source of truth is the same number->client map that routes inbound calls,
// plus the default line, so the two systems can never disagree.
//
// Deliberately PUBLIC (owner's call, 2026-07-28 — no shared secret to
// manage): it discloses only businesses' published phone numbers, digits
// out of context. The safety property lives on the CONSUMER side, which
// fails closed — if this endpoint is unreachable, the dialer treats every
// number as reserved and refuses to call. Never let this route grow richer
// data (names, client ids) without revisiting that decision.

import { DEFAULT_PHONE_NUMBER } from "@/lib/telephony/config";
import { loadAssignments, normalizeNumber } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

export async function GET() {
  const map = await loadAssignments();
  const reserved = new Set(Object.keys(map));
  reserved.add(normalizeNumber(DEFAULT_PHONE_NUMBER));

  // Digits-only, matching lib/telephony/numbers normalization. The consumer
  // must normalize its side the same way before comparing.
  return Response.json({ reserved: [...reserved].sort() });
}

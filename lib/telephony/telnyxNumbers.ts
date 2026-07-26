// Minimal Telnyx phone-number client for the Integrasjoner page. Endpoints
// verified against api.telnyx.com (both answer 401 unauthenticated, i.e.
// they exist): GET /v2/phone_numbers, PATCH /v2/phone_numbers/{id}.
//
// Scope is deliberately "numbers already on the account": buying numbers
// costs money and stays a deliberate human act in the Telnyx portal. The
// dashboard's job is the wiring, not the shopping.

export type TelnyxNumber = {
  id: string;
  phone_number: string;
  status?: string;
  connection_id?: string | null;
  connection_name?: string | null;
};

const BASE = "https://api.telnyx.com/v2";

export function telnyxConfigured(): boolean {
  return Boolean(process.env.TELNYX_API_KEY);
}

async function telnyx(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Telnyx ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export async function listPhoneNumbers(): Promise<TelnyxNumber[]> {
  const data = await telnyx("GET", "/phone_numbers?page[size]=100");
  return ((data.data ?? []) as TelnyxNumber[]).map((n) => ({
    id: n.id,
    phone_number: n.phone_number,
    status: n.status,
    connection_id: n.connection_id,
    connection_name: n.connection_name,
  }));
}

/** Points a number at a voice connection (our TeXML app), so inbound calls
 *  on it reach /api/telephony/telnyx-inbound like the existing line does. */
export async function setNumberConnection(numberId: string, connectionId: string): Promise<void> {
  await telnyx("PATCH", `/phone_numbers/${encodeURIComponent(numberId)}`, {
    connection_id: connectionId,
  });
}

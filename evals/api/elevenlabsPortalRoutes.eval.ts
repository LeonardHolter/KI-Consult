import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/data", () => ({ getProfile: vi.fn() }));

import { getProfile } from "@/lib/portal/data";
import { POST as sessionPost } from "@/app/api/portal/voice-agent/elevenlabs-session/route";
import { GET as conversationsGet, DELETE as conversationsDelete } from "@/app/api/portal/voice-agent/elevenlabs-conversations/route";

// The two portal routes that talk to ElevenLabs on a logged-in user's behalf.
// The boundary they enforce is the same one the rest of the portal has: a
// client user can only ever reach their OWN client, an admin must name one,
// and neither can reach a client that isn't on ElevenLabs. The transcript
// route additionally has to prove a conversation belongs to this client's
// agent — conversation ids are guessable, and the API key would happily
// return any conversation in the workspace.

const PILOT = "ad19951e-00e1-4293-8975-6c6bb1dbdad7"; // Handz On
const PILOT_AGENT = "agent_6301m0fs6p40feyaev39cv3qnn6c";
const NON_PILOT = "fe264dcd-84e0-4e59-8efb-cbb5e39c8125"; // Namsos, still OpenAI
const KEY = "sk-elevenlabs-secret";

const asClient = (clientId: string | null) =>
  vi.mocked(getProfile).mockResolvedValue({ role: "client", client_id: clientId } as never);
const asAdmin = () =>
  vi.mocked(getProfile).mockResolvedValue({ role: "admin", client_id: null } as never);

const sessionReq = (body: unknown = {}) =>
  new Request("http://localhost/api/portal/voice-agent/elevenlabs-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const listReq = (query = `?clientId=${PILOT}`) =>
  new Request(`http://localhost/api/portal/voice-agent/elevenlabs-conversations${query}`);

beforeEach(() => {
  vi.mocked(getProfile).mockReset();
  process.env.ELEVENLABS_API_KEY = KEY;
});

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/portal/voice-agent/elevenlabs-session", () => {
  it("403s a logged-out visitor before calling ElevenLabs", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sessionPost(sessionReq());
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s a client that is not on ElevenLabs, without spending an API call", async () => {
    asClient(NON_PILOT);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sessionPost(sessionReq());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_elevenlabs_client" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The tenancy rule: a client user's own id wins over anything they post.
  it("ignores a clientId a client user tries to pass, using their own", async () => {
    asClient(NON_PILOT);
    vi.stubGlobal("fetch", vi.fn());

    const res = await sessionPost(sessionReq({ clientId: PILOT }));
    expect(res.status).toBe(404); // still resolved as Namsos
  });

  it("mints a signed URL for a pilot client and returns only that URL", async () => {
    asClient(PILOT);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ signed_url: "wss://api.elevenlabs.io/x?token=abc" }), { status: 200 }),
      ),
    );

    const res = await sessionPost(sessionReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signedUrl: "wss://api.elevenlabs.io/x?token=abc" });
    // The API key must never travel to the browser with the URL.
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("502s — not 500 — when ElevenLabs rejects the mint", async () => {
    asClient(PILOT);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));

    const res = await sessionPost(sessionReq());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  });

  it("500s when the API key is missing rather than calling out unauthenticated", async () => {
    asClient(PILOT);
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sessionPost(sessionReq());
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/portal/voice-agent/elevenlabs-conversations", () => {
  it("403s a logged-out visitor", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const res = await conversationsGet(listReq());
    expect(res.status).toBe(403);
  });

  it("tags each conversation with what it ended in, and returns no summary", async () => {
    asAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            conversations: [
              { conversation_id: "booked", start_time_unix_secs: 1787306400, call_duration_secs: 150, message_count: 30, status: "done", call_successful: "success", termination_reason: "end_call tool was called.", tool_names: ["get_available_demo_slots", "book_demo_slot", "end_call"] },
              { conversation_id: "gaveup", start_time_unix_secs: 1787306500, call_duration_secs: 40, message_count: 9, status: "done", call_successful: "success", termination_reason: "Client disconnected: 1005", tool_names: ["get_available_demo_slots"] },
              { conversation_id: "asked", start_time_unix_secs: 1787306600, call_duration_secs: 60, message_count: 12, status: "done", call_successful: "success", termination_reason: "end_call tool was called.", tool_names: ["end_call"] },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const { conversations } = await (await conversationsGet(listReq())).json();
    expect(conversations.map((c: { status: { label: string } }) => c.status.label)).toEqual([
      "Booking",
      "Avbrutt",
      "Informasjon",
    ]);
    // Summaries arrive half in English; the tag replaced them entirely.
    expect(conversations.every((c: Record<string, unknown>) => !("summary" in c))).toBe(true);
  });

  it("lists finished conversations, dropping failed ones", async () => {
    asAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            conversations: [
              { conversation_id: "c1", start_time_unix_secs: 1787306400, call_duration_secs: 120, message_count: 12, status: "done", transcript_summary: "Booket vask" },
              { conversation_id: "c2", start_time_unix_secs: 1787306500, call_duration_secs: 0, message_count: 0, status: "failed" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await conversationsGet(listReq());
    expect(res.status).toBe(200);
    const { conversations } = await res.json();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: "c1",
      durationSeconds: 120,
      messageCount: 12,
    });
    expect(conversations[0].startedAt).toBe(new Date(1787306400 * 1000).toISOString());
  });

  // The one that matters: conversation ids are short and guessable, and the
  // workspace key can read every conversation in the account. Without the
  // agent_id check a portal user could read another client's calls.
  it("404s a real conversation that belongs to a different client's agent", async () => {
    asAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            agent_id: "agent_someone_else",
            transcript: [{ role: "agent", message: "hemmelig" }],
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await conversationsGet(listReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("hemmelig");
  });

  it("returns the transcript when the conversation belongs to this client's agent", async () => {
    asAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            agent_id: PILOT_AGENT,
            transcript: [
              { role: "agent", message: "Hei!", time_in_call_secs: 0 },
              { role: "user", message: "Hei, jeg vil booke", time_in_call_secs: 4 },
              { role: "agent", message: null, tool_calls: [{ tool_name: "book_demo_slot" }] },
              { role: "agent", message: null }, // tom tur — skal filtreres bort
            ],
            analysis: { transcript_summary: "Kunden booket" },
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await conversationsGet(listReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(200);
    const { transcript } = await res.json();
    expect(transcript).toHaveLength(3);
    expect(transcript[1]).toMatchObject({ role: "user", message: "Hei, jeg vil booke" });
    expect(transcript[2].toolCalls).toEqual(["book_demo_slot"]);
  });

  it("rejects a malformed conversation id instead of putting it in a URL", async () => {
    asAdmin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsGet(listReq(`?clientId=${PILOT}&conversation=../../secrets`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s a non-pilot client without calling ElevenLabs", async () => {
    asAdmin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsGet(listReq(`?clientId=${NON_PILOT}`));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


// Deleting a conversation erases the transcript AND the recording of what
// the agent said to a customer, at ElevenLabs, with no copy on our side.
// Same rule as the recordings route: admin only, and never another client's.
describe("DELETE /api/portal/voice-agent/elevenlabs-conversations", () => {
  const delReq = (query: string) =>
    new Request(`http://localhost/api/portal/voice-agent/elevenlabs-conversations${query}`, {
      method: "DELETE",
    });

  it("refuses a client account — they may read their calls, not remove them", async () => {
    asClient(PILOT);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsDelete(delReq(`?conversation=c1`));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a logged-out visitor", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const res = await conversationsDelete(delReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(403);
  });

  // The dangerous one: ids are short and the workspace key can delete any
  // conversation in the account, so ownership must be proven before deleting.
  it("never deletes a conversation belonging to another client's agent", async () => {
    asAdmin();
    const fetchMock = vi.fn(async (_url: string, _init?: { method?: string }) =>
      new Response(JSON.stringify({ agent_id: "agent_someone_else" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsDelete(delReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(404);
    // Only the ownership lookup ran — no DELETE was ever issued.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("deletes a conversation that belongs to this client's agent", async () => {
    asAdmin();
    const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) =>
      init?.method === "DELETE"
        ? new Response("{}", { status: 200 })
        : new Response(JSON.stringify({ agent_id: PILOT_AGENT }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsDelete(delReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const deleteCall = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
    expect(deleteCall?.[0]).toContain("/v1/convai/conversations/c1");
  });

  it("rejects a malformed id instead of putting it in a URL", async () => {
    asAdmin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await conversationsDelete(delReq(`?clientId=${PILOT}&conversation=../secrets`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed upstream delete as 502, not as success", async () => {
    asAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { method?: string }) =>
        init?.method === "DELETE"
          ? new Response("nope", { status: 500 })
          : new Response(JSON.stringify({ agent_id: PILOT_AGENT }), { status: 200 }),
      ),
    );

    const res = await conversationsDelete(delReq(`?clientId=${PILOT}&conversation=c1`));
    expect(res.status).toBe(502);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal/data", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/voiceDemo/mintClientSecret", () => ({ mintRealtimeClientSecret: vi.fn() }));

import { getProfile } from "@/lib/portal/data";
import { mintRealtimeClientSecret } from "@/lib/voiceDemo/mintClientSecret";
import { POST } from "@/app/api/portal/voice-demo/test-session/route";

const ADMIN = { id: "a1", role: "admin" as const, client_id: null, full_name: null };
const CLIENT = { id: "u1", role: "client" as const, client_id: "c1", full_name: null };

function req(body: unknown) {
  return new Request("http://localhost/api/portal/voice-demo/test-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getProfile).mockReset();
  vi.mocked(mintRealtimeClientSecret)
    .mockReset()
    .mockResolvedValue({ ok: true, clientSecret: "ek_test", model: "gpt-realtime" });
});

describe("POST /api/portal/voice-demo/test-session", () => {
  it("403s a client-role user — this route accepts arbitrary instructions and must stay admin-only", async () => {
    vi.mocked(getProfile).mockResolvedValue(CLIENT);

    const res = await POST(req({ instructions: "anything" }));

    expect(res.status).toBe(403);
    expect(mintRealtimeClientSecret).not.toHaveBeenCalled();
  });

  it("403s a logged-out visitor", async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const res = await POST(req({ instructions: "anything" }));
    expect(res.status).toBe(403);
  });

  it("400s when instructions is missing", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    const res = await POST(req({ model: "gpt-realtime" }));

    expect(res.status).toBe(400);
    expect(mintRealtimeClientSecret).not.toHaveBeenCalled();
  });

  it("passes the admin's arbitrary draft settings straight through to minting", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await POST(
      req({
        instructions: "draft prompt",
        model: "gpt-realtime-mini",
        voice: "sage",
        turnDetection: { type: "server_vad", threshold: 0.6, prefix_padding_ms: 200, silence_duration_ms: 400, interrupt_response: false },
      }),
    );

    const mintedWith = vi.mocked(mintRealtimeClientSecret).mock.calls[0][0];
    expect(mintedWith.instructions).toBe("draft prompt");
    expect(mintedWith.model).toBe("gpt-realtime-mini");
    expect(mintedWith.voice).toBe("sage");
    expect(mintedWith.turnDetection).toMatchObject({ type: "server_vad", interrupt_response: false });
  });

  it("fills in defaults for any settings field the caller omits", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await POST(req({ instructions: "draft prompt" }));

    const mintedWith = vi.mocked(mintRealtimeClientSecret).mock.calls[0][0];
    expect(mintedWith.model).toBe("gpt-realtime");
    expect(mintedWith.voice).toBe("marin");
    expect(mintedWith.noiseReduction).toBe("near_field");
  });

  // Regression: a client agent's prompt documents get_available_demo_slots and
  // book_demo_slot, but this route used to mint the test session WITHOUT tools.
  // The model then announced "jeg sjekker kalenderen", found nothing to call,
  // and degraded to emitting text instead of audio — the prompt/tool-list
  // mismatch OpenAI's realtime guide warns about. Testing a prompt has to
  // exercise the same tools the real dashboard agent gets.
  it("registers the booking tools when testing a client agent", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await POST(req({ instructions: "client prompt", clientId: "c1" }));

    const opts = vi.mocked(mintRealtimeClientSecret).mock.calls[0][1];
    expect(opts).toMatchObject({ withTools: true });
  });

  it("registers NO tools for the marketing demo, which has no calendar behind it", async () => {
    vi.mocked(getProfile).mockResolvedValue(ADMIN);

    await POST(req({ instructions: "tannlege demo prompt" }));

    const opts = vi.mocked(mintRealtimeClientSecret).mock.calls[0][1];
    expect(opts?.withTools).toBeFalsy();
  });
});

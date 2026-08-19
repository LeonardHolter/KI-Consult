import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  loadSettings: vi.fn(async () => ({ voiceBookingMode: "sandbox" })),
}));
vi.mock("@/lib/bookingTools", () => ({
  execBookingTool: vi.fn(async () => ({ success: true, echo: true })),
}));
vi.mock("@/lib/botEvents", () => ({ logBotEvent: vi.fn(async () => {}) }));

import { dialTexml } from "@/lib/telephony/texml";
import { OPENAI_SIP_URI } from "@/lib/telephony/config";
import { POST as toolsPost } from "@/app/api/telephony/elevenlabs-tools/route";
import { POST as initPost } from "@/app/api/telephony/elevenlabs-init/route";
import { execBookingTool } from "@/lib/bookingTools";

// The ElevenLabs pilot must be surgically scoped: ONLY clients in the
// ELEVENLABS_VOICE_AGENTS map may be dialed to ElevenLabs or execute tools
// through the webhook route. A regression here either breaks every other
// client's phone line (dialed to the wrong platform) or opens the booking
// executor to arbitrary client ids. test_kunde's real id doubles as the
// pilot fixture since the map is hardcoded.

const PILOT_CLIENT = "18c22e0d-95f6-4a34-aac6-621281771364";
const SECRET = "eval-secret";

afterEach(() => vi.unstubAllEnvs());

describe("ElevenLabs pilot TeXML routing", () => {
  it("dials the pilot client's number to the ElevenLabs SIP trunk with digest auth", () => {
    vi.stubEnv("ELEVENLABS_SIP_USERNAME", "user-x");
    vi.stubEnv("ELEVENLABS_SIP_PASSWORD", "pass-y");
    const xml = dialTexml({
      base: "https://www.kiconsult.no",
      dialed: "+4723509652",
      clientId: PILOT_CLIENT,
      record: true,
    });
    expect(xml).toContain("sip:+4723509652@sip.rtc.elevenlabs.io");
    expect(xml).toContain('username="user-x"');
    expect(xml).toContain('password="pass-y"');
    expect(xml).not.toContain("sip.api.openai.com");
    // The recording panel must keep working for pilot calls.
    expect(xml).toContain('record="record-from-answer"');
  });

  it("keeps every non-pilot client on the OpenAI SIP URI, auth attrs absent", () => {
    vi.stubEnv("ELEVENLABS_SIP_USERNAME", "user-x");
    const xml = dialTexml({
      base: "https://www.kiconsult.no",
      dialed: "+4723509651",
      clientId: "fe264dcd-84e0-4e59-8efb-cbb5e39c8125", // Namsos
      record: true,
    });
    expect(xml).toContain(OPENAI_SIP_URI.split("?")[0]);
    expect(xml).not.toContain("elevenlabs");
    expect(xml).not.toContain("username=");
  });
});

describe("ElevenLabs webhook endpoints", () => {
  const toolsReq = (headers: Record<string, string>, client = PILOT_CLIENT) =>
    new Request(
      `https://www.kiconsult.no/api/telephony/elevenlabs-tools?client=${client}&tool=get_available_demo_slots`,
      { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" },
    );

  it("rejects tool calls without the shared secret, and with no secret configured", async () => {
    vi.stubEnv("ELEVENLABS_TOOLS_SECRET", SECRET);
    expect((await toolsPost(toolsReq({}))).status).toBe(403);
    expect((await toolsPost(toolsReq({ "x-tools-secret": "wrong" }))).status).toBe(403);
    vi.stubEnv("ELEVENLABS_TOOLS_SECRET", "");
    // An unset secret must fail closed, never open.
    expect((await toolsPost(toolsReq({ "x-tools-secret": "" }))).status).toBe(403);
  });

  it("rejects non-pilot clients even with a valid secret", async () => {
    vi.stubEnv("ELEVENLABS_TOOLS_SECRET", SECRET);
    const res = await toolsPost(
      toolsReq({ "x-tools-secret": SECRET }, "ad19951e-00e1-4293-8975-6c6bb1dbdad7"),
    );
    expect(res.status).toBe(403);
    expect(execBookingTool).not.toHaveBeenCalled();
  });

  it("executes tools for the pilot client with the server-side scope", async () => {
    vi.stubEnv("ELEVENLABS_TOOLS_SECRET", SECRET);
    const res = await toolsPost(toolsReq({ "x-tools-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, echo: true });
    expect(execBookingTool).toHaveBeenCalledWith(
      PILOT_CLIENT,
      "get_available_demo_slots",
      {},
      "sandbox",
    );
  });

  it("init webhook returns date context and the SYSTEMINFO block for plausible callers only", async () => {
    vi.stubEnv("ELEVENLABS_TOOLS_SECRET", SECRET);
    const initReq = (callerId: string) =>
      new Request("https://www.kiconsult.no/api/telephony/elevenlabs-init", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tools-secret": SECRET },
        body: JSON.stringify({ caller_id: callerId }),
      });

    const withCaller = await (await initPost(initReq("+4794177814"))).json();
    expect(withCaller.type).toBe("conversation_initiation_client_data");
    expect(withCaller.dynamic_variables.date_context).toMatch(/\(\d{4}-\d{2}-\d{2}\)/);
    expect(withCaller.dynamic_variables.systeminfo).toContain("SYSTEMINFO FRA TELEFONSYSTEMET");
    expect(withCaller.dynamic_variables.systeminfo).toContain("+4794177814");

    // Withheld/anonymous caller: no block, so the prompt falls back to asking.
    const anonymous = await (await initPost(initReq("anonymous"))).json();
    expect(anonymous.dynamic_variables.systeminfo).toBe("");
  });
});

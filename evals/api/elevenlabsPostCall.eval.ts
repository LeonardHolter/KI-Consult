import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The post-call webhook is the only path that ever carries a full transcript
// — the summary mail leaves mid-call. What matters here: an unsigned caller
// can never make us mail a shop, a call that produced no enquiry never mails
// at all, and the transcript that does go out reads in order.

const { notifyShop, loadSettings } = vi.hoisted(() => ({
  notifyShop: vi.fn(async () => ({ sent: true })),
  // Typed wider than the default so a test can flip combinedCallEmail on.
  loadSettings: vi.fn(
    async (): Promise<{ voiceBookingMode?: string; combinedCallEmail?: boolean }> => ({
      voiceBookingMode: "live",
    }),
  ),
}));
vi.mock("@/lib/notify", () => ({ notifyShop }));
vi.mock("@/lib/settings", () => ({ loadSettings }));

import { POST } from "@/app/api/telephony/elevenlabs-post-call/route";
import {
  callbackDetails,
  formatTranscript,
  stripFillers,
  hasCallback,
  verifyElevenLabsWebhook,
} from "@/lib/telephony/postCall";

const SECRET = "wsec_eval";
/** Hedin Automotive Haugesund — the agent this was built for. */
const AGENT = "agent_2101m2dtfrgqek6as9aypd2wsrpb";
const CLIENT = "9c17e3d8-0fef-41d5-bb0b-7abcd7741029";

const turns = [
  { role: "agent", message: "Hei, du snakker med den digitale resepsjonisten.", time_in_call_secs: 0 },
  { role: "user", message: "Jeg trenger EU-kontroll.", time_in_call_secs: 4 },
  { role: "agent", message: "", time_in_call_secs: 9, tool_calls: [{ tool_name: "lookup_vehicle" }] },
  { role: "user", message: "BS 12345.", time_in_call_secs: 12 },
  {
    role: "agent",
    message: "Takk, jeg sender dette videre.",
    time_in_call_secs: 70,
    tool_calls: [
      {
        tool_name: "request_callback",
        params_as_json: JSON.stringify({
          customer_phone: "+4748435330",
          message: "Bytte vindusviskere.",
          customer_name: "William",
          vehicle: "Porsche Cayenne Turbo S E-Hybrid, DR 74619",
        }),
      },
    ],
  },
];

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "post_call_transcription",
    data: {
      agent_id: AGENT,
      conversation_id: "conv_1",
      transcript: turns,
      metadata: { call_duration_secs: 95, phone_call: { external_number: "+4798361774" } },
      ...over,
    },
  });

const signed = (raw: string, secret = SECRET, tsMs = Date.now()) => {
  const t = Math.floor(tsMs / 1000);
  const v0 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return new Request("https://www.kiconsult.no/api/telephony/elevenlabs-post-call", {
    method: "POST",
    headers: { "content-type": "application/json", "elevenlabs-signature": `t=${t},v0=${v0}` },
    body: raw,
  });
};

beforeEach(() => {
  vi.stubEnv("ELEVENLABS_WEBHOOK_SECRET", SECRET);
  notifyShop.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("post-call webhook auth", () => {
  it("refuses an unsigned or wrongly signed body, and never mails", async () => {
    const raw = payload();
    const unsigned = new Request("https://www.kiconsult.no/api/telephony/elevenlabs-post-call", {
      method: "POST",
      body: raw,
    });
    expect((await POST(unsigned)).status).toBe(403);

    const wrongKey = signed(raw, "wsec_someone_else");
    expect((await POST(wrongKey)).status).toBe(403);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("refuses a replayed signature from outside the tolerance window", async () => {
    const raw = payload();
    const old = signed(raw, SECRET, Date.now() - 30 * 60 * 1000);
    expect((await POST(old)).status).toBe(403);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("stays quiet, not broken, when no secret is configured", async () => {
    vi.stubEnv("ELEVENLABS_WEBHOOK_SECRET", "");
    const res = await POST(signed(payload()));
    expect(res.status).toBe(200);
    expect(notifyShop).not.toHaveBeenCalled();
  });
});

describe("post-call webhook delivery", () => {
  it("mails the shop the whole conversation, in order", async () => {
    const res = await POST(signed(payload()));
    expect(res.status).toBe(200);
    expect(notifyShop).toHaveBeenCalledTimes(1);

    const [clientId, n] = notifyShop.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(clientId).toBe(CLIENT);
    expect(n.kind).toBe("transcript");
    expect(n.customerPhone).toContain("98361774");
    expect(n.durationSecs).toBe(95);
    expect(n.transcript).toEqual([
      "[00:00] Agent: Hei, du snakker med den digitale resepsjonisten.",
      "[00:04] Kunde: Jeg trenger EU-kontroll.",
      "[00:12] Kunde: BS 12345.",
      "[01:10] Agent: Takk, jeg sender dette videre.",
    ]);
  });

  it("sends nothing for a call that never produced an enquiry", async () => {
    // A hangup or wrong number: no request_callback anywhere in the turns.
    const raw = payload({ transcript: turns.filter((t) => !t.tool_calls) });
    const res = await POST(signed(raw));
    expect(res.status).toBe(200);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("ignores an agent outside the pilot map", async () => {
    const raw = payload({ agent_id: "agent_someone_elses" });
    expect((await POST(signed(raw))).status).toBe(200);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("labels a browser session instead of printing an empty number", async () => {
    const raw = payload({ metadata: { call_duration_secs: 20 } });
    await POST(signed(raw));
    const [, n] = notifyShop.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(n.customerPhone).toBe("nettleser-demo");
  });
});

describe("combined mail (one per call)", () => {
  it("carries the enquiry so the single mail is the whole record", async () => {
    loadSettings.mockResolvedValueOnce({ voiceBookingMode: "live", combinedCallEmail: true });
    await POST(signed(payload()));
    const [, n] = notifyShop.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(n.customerName).toBe("William");
    expect(n.vehicle).toBe("Porsche Cayenne Turbo S E-Hybrid, DR 74619");
    expect(n.note).toBe("Bytte vindusviskere.");
    // The number the caller confirmed wins over the line the call arrived on.
    expect(n.customerPhone).toBe("+4748435330");
  });

  it("leaves the enquiry out when the shop still gets the mid-call mail", async () => {
    loadSettings.mockResolvedValueOnce({ voiceBookingMode: "live" });
    await POST(signed(payload()));
    const [, n] = notifyShop.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(n.note).toBeUndefined();
    expect(n.customerName).toBeUndefined();
  });

  it("takes the caller's correction, not their first answer", () => {
    const corrected = [
      ...turns,
      {
        role: "agent",
        message: "Oppdatert.",
        time_in_call_secs: 90,
        tool_calls: [
          {
            tool_name: "request_callback",
            params_as_json: JSON.stringify({
              customer_phone: "+4799999999",
              message: "OPPDATERT: bytte vindusviskere og EU-kontroll.",
            }),
          },
        ],
      },
    ];
    expect(callbackDetails(corrected)?.customerPhone).toBe("+4799999999");
  });

  it("keeps the transcript even when the arguments are malformed", () => {
    const broken = [{ role: "agent", tool_calls: [{ tool_name: "request_callback", params_as_json: "{ikke json" }] }];
    expect(callbackDetails(broken)).toBeNull();
    expect(hasCallback(broken)).toBe(true);
  });
});

describe("transcript shaping", () => {
  it("drops wordless turns but keeps their tool call visible to the gate", () => {
    expect(formatTranscript(turns)).toHaveLength(4); // the lookup_vehicle turn has no words
    expect(hasCallback(turns)).toBe(true);
    expect(hasCallback(turns.filter((t) => !t.tool_calls))).toBe(false);
  });

  it("survives a malformed payload rather than throwing", () => {
    expect(formatTranscript(undefined)).toEqual([]);
    expect(formatTranscript(null)).toEqual([]);
    expect(hasCallback(undefined)).toBe(false);
  });

  it("rejects a tampered body even with a valid-looking header", () => {
    const raw = payload();
    const t = Math.floor(Date.now() / 1000);
    const v0 = crypto.createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
    const tampered = raw.replace("EU-kontroll", "noe helt annet");
    expect(verifyElevenLabsWebhook(tampered, `t=${t},v0=${v0}`, SECRET).ok).toBe(false);
  });
});

describe("hesitation sounds", () => {
  it("strips them without touching words that merely contain the letters", () => {
    expect(stripFillers("Ja, ehh, de, eh, bruker IF-forsikring.")).toBe("Ja de bruker IF-forsikring.");
    expect(stripFillers("Vi trenger et dekkhotell, øh, til vinteren.")).toBe(
      "Vi trenger et dekkhotell til vinteren.",
    );
    // «eh» lives inside both of these; neither may lose it.
    expect(stripFillers("Behandlingen var grei.")).toBe("Behandlingen var grei.");
    expect(stripFillers("Jeg heter Mehmet.")).toBe("Jeg heter Mehmet.");
    // Answers are not filler, however short.
    expect(stripFillers("Ja.")).toBe("Ja.");
    expect(stripFillers("Nei, det går bra.")).toBe("Nei, det går bra.");
  });

  it("keeps the sentence capitalised when the filler led it", () => {
    expect(stripFillers("Eh, jeg vil bytte vindusviskere.")).toBe("Jeg vil bytte vindusviskere.");
    expect(stripFillers("Hmm, det stemmer.")).toBe("Det stemmer.");
  });

  it("drops a turn that was nothing but hesitation", () => {
    const lines = formatTranscript([
      { role: "user", message: "Eh.", time_in_call_secs: 5 },
      { role: "user", message: "Ja, eh, det stemmer.", time_in_call_secs: 71 },
    ]);
    expect(lines).toEqual(["[01:11] Kunde: Ja det stemmer."]);
  });
});

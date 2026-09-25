import { beforeEach, describe, expect, it, vi } from "vitest";

// The agent tells a customer, out loud and mid-call, that a text message is
// on its way. Everything here protects that sentence: the number must reach
// Telnyx in the shape it accepts, and a failure must come back as a failure
// rather than a thrown error the tool layer would report as success.

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { sendSms, smsConfigured } from "@/lib/telephony/sms";

const ok = () => ({ ok: true, json: async () => ({ data: { id: "msg_1" } }) });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok());
  process.env.TELNYX_API_KEY = "KEY-test";
  process.env.TELNYX_MESSAGING_PROFILE_ID = "prof_1";
  delete process.env.TELNYX_SMS_FROM;
});

const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("outbound SMS", () => {
  it("sends an 8-digit Norwegian number as E.164", async () => {
    await sendSms("48435330", "hei");
    expect(bodyOf().to).toBe("+4748435330");
  });

  it("leaves a number that already carries its country code alone", async () => {
    await sendSms("+47 484 35 330", "hei");
    expect(bodyOf().to).toBe("+4748435330");
  });

  it("prefers the messaging profile, and falls back to a plain from-number", async () => {
    await sendSms("48435330", "hei");
    expect(bodyOf().messaging_profile_id).toBe("prof_1");

    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    process.env.TELNYX_SMS_FROM = "+4723509652";
    fetchMock.mockClear();
    await sendSms("48435330", "hei");
    expect(bodyOf().from).toBe("+4723509652");
  });

  it("reports a refusal instead of throwing, so the agent can stay honest", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "no route" });
    const r = await sendSms("48435330", "hei");
    expect(r).toMatchObject({ sent: false });
    expect((r as { reason: string }).reason).toContain("422");
  });

  it("reports a network failure the same way", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await sendSms("48435330", "hei")).toMatchObject({ sent: false });
  });

  it("refuses junk numbers before spending a Telnyx call", async () => {
    expect(await sendSms("12", "hei")).toMatchObject({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says it is unconfigured rather than half-sending", async () => {
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    expect(smsConfigured()).toBe(false);
    expect(await sendSms("48435330", "hei")).toMatchObject({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

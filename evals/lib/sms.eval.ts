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

  it("sends the profile and the sender together, which is what 40321 needs", async () => {
    // Profile alone: Telnyx has to pick a number off the profile, and a
    // Norwegian voice line cannot be SMS-enabled, so there is none.
    await sendSms("48435330", "hei");
    expect(bodyOf()).toMatchObject({ messaging_profile_id: "prof_1" });
    expect(bodyOf().from).toBeUndefined();

    process.env.TELNYX_SMS_FROM = "HedinAuto";
    fetchMock.mockClear();
    await sendSms("48435330", "hei");
    expect(bodyOf()).toMatchObject({ messaging_profile_id: "prof_1", from: "HedinAuto" });
  });

  it("still works with only a from-number, for an SMS-enabled line", async () => {
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    process.env.TELNYX_SMS_FROM = "+4723509652";
    await sendSms("48435330", "hei");
    expect(bodyOf()).toMatchObject({ from: "+4723509652" });
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

describe("refusal reasons", () => {
  it("carries Telnyx's own explanation, not just the status code", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () =>
        JSON.stringify({ errors: [{ code: "40300", title: "Sender not eligible", detail: "No sender for destination" }] }),
    });
    const r = await sendSms("48435330", "hei");
    const reason = (r as { reason: string }).reason;
    expect(reason).toContain("409");
    expect(reason).toContain("Sender not eligible");
    // Says which sender fields went out, so a refusal can be told apart
    // from configuration that never reached production.
    expect(reason).toContain("messaging_profile_id");
  });

  it("falls back to the raw body when it is not the usual shape", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "upstream exploded" });
    expect((await sendSms("48435330", "hei") as { reason: string }).reason).toContain("upstream exploded");
  });
});

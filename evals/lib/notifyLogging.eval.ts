import { beforeEach, describe, expect, it, vi } from "vitest";

// Every notification's outcome has to leave a trace, because the failure it
// guards against is silence: a booking mail that never arrives changes
// nothing the customer or the agent can see. The shop simply never learns
// someone is coming. Resend's free tier caps at 100 mails a day for the
// whole account, so the most likely cause is also the one that arrives
// without warning.

const { send, logBotEvent, loadSettings } = vi.hoisted(() => ({
  send: vi.fn(async () => ({ error: null as { name: string; message: string } | null })),
  logBotEvent: vi.fn(async () => {}),
  loadSettings: vi.fn(async () => ({ notificationEmail: "sa@handzon.no" })),
}));

vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/botEvents", () => ({ logBotEvent, botEventsEnabled: true }));
vi.mock("@/lib/settings", () => ({ loadSettings }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

import { notifyShop } from "@/lib/notify";

const CLIENT = "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const booking = {
  kind: "booking" as const,
  date: "2026-08-22",
  time: "10:30",
  customerPhone: "+4798361774",
  scope: "live" as const,
};

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  send.mockClear();
  send.mockResolvedValue({ error: null });
  logBotEvent.mockClear();
  loadSettings.mockResolvedValue({ notificationEmail: "sa@handzon.no" });
});

describe("notification outcomes are recorded", () => {
  it("logs a successful send", async () => {
    const result = await notifyShop(CLIENT, booking);
    expect(result.sent).toBe(true);
    expect(logBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT,
        type: "notify_sent",
        detail: expect.objectContaining({ kind: "booking", scope: "live" }),
      }),
    );
  });

  // The one that matters: this is the moment the shop stops hearing from us.
  it("logs a rejected send, with the reason", async () => {
    send.mockResolvedValue({ error: { name: "rate_limit_exceeded", message: "Daily quota reached" } });

    const result = await notifyShop(CLIENT, booking);
    expect(result.sent).toBe(false);
    expect(logBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "notify_failed",
        detail: expect.objectContaining({ reason: expect.stringContaining("Daily quota") }),
      }),
    );
  });

  // A client with no address configured never even reaches Resend — which is
  // exactly how Handz On silently notified nobody for a day.
  it("logs a failure when the client has no notification address", async () => {
    loadSettings.mockResolvedValue({ notificationEmail: undefined as unknown as string });

    const result = await notifyShop(CLIENT, booking);
    expect(result.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(logBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "notify_failed",
        detail: expect.objectContaining({ reason: expect.stringContaining("notificationEmail") }),
      }),
    );
  });

  it("logs a failure when the mail key is missing entirely", async () => {
    delete process.env.RESEND_API_KEY;
    await notifyShop(CLIENT, booking);
    expect(logBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "notify_failed" }),
    );
  });

  it("records the kind, so callbacks and bookings can be told apart", async () => {
    await notifyShop(CLIENT, { ...booking, kind: "callback", note: "Vil ha pris" });
    expect(logBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ kind: "callback" }) }),
    );
  });

  // Logging is bookkeeping; delivery is the job. One must never affect the
  // other — least of all on the booking path, mid-call.
  it("still reports a sent mail when the logging itself fails", async () => {
    logBotEvent.mockRejectedValueOnce(new Error("supabase down") as never);
    const result = await notifyShop(CLIENT, booking);
    expect(send).toHaveBeenCalled();
    // The mail went out, so that is what the caller must be told. Reporting
    // failure here would have the agent tell a caller their message did not
    // go through, seconds after it did.
    expect(result.sent).toBe(true);
  });
});

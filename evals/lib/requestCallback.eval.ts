import { beforeEach, describe, expect, it, vi } from "vitest";

// The answer to "can I speak to a person?" on an agent that cannot transfer:
// take the number and the errand, and mail it to the shop. Sabah's ask,
// 2026-08-21.
//
// The property that matters: the agent may only tell the caller someone will
// ring back if the mail actually went out. Everything else about this call is
// gone the moment it ends — there is no booking, no calendar entry, nothing
// to find later. A false promise here is a lost customer who thinks they are
// waiting for a call.

vi.mock("@/lib/notify", () => ({
  notifyShop: vi.fn(async () => ({ sent: true })),
  looksLikeEmail: () => true,
}));

import { notifyShop } from "@/lib/notify";
import { execBookingTool, REQUEST_CALLBACK_TOOL } from "@/lib/bookingTools";

const CLIENT = "ad19951e-00e1-4293-8975-6c6bb1dbdad7";

beforeEach(() => {
  vi.mocked(notifyShop).mockClear();
  vi.mocked(notifyShop).mockResolvedValue({ sent: true });
});

describe("request_callback", () => {
  it("mails the shop the number and the errand", async () => {
    const result = await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      {
        customer_phone: "+4798361774",
        message: "Vil ha pris på lakkforsegling til varebil",
        customer_name: "Sander",
      },
      "live",
    );

    expect(result.success).toBe(true);
    expect(notifyShop).toHaveBeenCalledTimes(1);
    expect(notifyShop).toHaveBeenCalledWith(
      CLIENT,
      expect.objectContaining({
        kind: "callback",
        customerPhone: "+4798361774",
        customerName: "Sander",
        note: "Vil ha pris på lakkforsegling til varebil",
        scope: "live",
      }),
    );
  });

  it("works without a name — the number and the errand are what matter", async () => {
    const result = await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      { customer_phone: "98361774", message: "Vil snakke med noen om en skade" },
      "live",
    );
    expect(result.success).toBe(true);
  });

  // The whole point: no mail, no promise.
  it("reports failure when the mail could not be sent", async () => {
    vi.mocked(notifyShop).mockResolvedValue({ sent: false, reason: "ingen notificationEmail satt" });

    const result = await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      { customer_phone: "98361774", message: "Vil snakke med noen" },
      "live",
    );

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("ringe avdelingen");
  });

  it("refuses without a phone number to ring back", async () => {
    const result = await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      { message: "Vil snakke med noen" },
      "live",
    );
    expect(result.success).toBe(false);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("refuses without an errand — a bare number tells the shop nothing", async () => {
    const result = await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      { customer_phone: "98361774" },
      "live",
    );
    expect(result.success).toBe(false);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("marks a sandbox callback as test traffic", async () => {
    await execBookingTool(
      CLIENT,
      REQUEST_CALLBACK_TOOL,
      { customer_phone: "98361774", message: "Test" },
      "sandbox",
    );
    expect(notifyShop).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ scope: "sandbox" }));
  });
});

describe("the callback e-mail itself", () => {
  it("puts the number in the subject and the errand in the body", async () => {
    const { buildShopEmail } = await import("@/lib/notifyEmail");
    const mail = buildShopEmail("Handz On Strømmen", {
      kind: "callback",
      date: "2026-08-21",
      time: "14:05",
      customerPhone: "+4798361774",
      customerName: "Sander",
      note: "Vil ha pris på lakkforsegling",
      scope: "live",
    });

    // Actionable from a phone's lock screen without opening the mail.
    expect(mail.subject).toBe("Ønsker å bli oppringt: +4798361774");
    expect(mail.text).toContain("Vil ha pris på lakkforsegling");
    expect(mail.text).toContain("ring kunden tilbake");
    // It is a to-do, not a booking record — no appointment wording.
    expect(mail.subject).not.toContain("booking");
  });

  it("marks a test callback so nobody rings a fake customer", async () => {
    const { buildShopEmail } = await import("@/lib/notifyEmail");
    const mail = buildShopEmail("Handz On Strømmen", {
      kind: "callback",
      date: "2026-08-21",
      time: "14:05",
      customerPhone: "+4798361774",
      note: "Test",
      scope: "sandbox",
    });
    expect(mail.subject).toContain("[TEST]");
    expect(mail.text).toContain("ikke en ekte kunde");
  });
});

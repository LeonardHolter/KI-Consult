import { beforeEach, describe, expect, it, vi } from "vitest";

// The wiring between the shared booking executor and the shop's inbox. What
// matters: a successful book/note fires exactly one notification with the
// right kind and scope, a FAILED one fires nothing (the shop must never read
// about a booking that does not exist), and a notify failure never breaks
// the tool result the model sees.

const blobStore = new Map<string, string>();

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (key: string) => {
    if (!blobStore.has(key)) return null;
    return { statusCode: 200, stream: new Response(blobStore.get(key)!).body };
  }),
  put: vi.fn(async (key: string, body: string) => {
    blobStore.set(key, body);
    return { url: `https://blob.test/${key}` };
  }),
}));

vi.mock("@/lib/notify", () => ({
  notifyShop: vi.fn(async () => undefined),
  looksLikeEmail: () => true,
}));

import { notifyShop } from "@/lib/notify";
import { execBookingTool, ADD_NOTE_TOOL, BOOK_SLOT_TOOL, GET_SLOTS_TOOL } from "@/lib/bookingTools";

const CLIENT = "99999999-8888-7777-6666-555555555555";

async function firstSlot(): Promise<{ date: string; time: string }> {
  const res = (await execBookingTool(CLIENT, GET_SLOTS_TOOL, { date: null, near_time: null }, "sandbox")) as {
    available_slots: { date: string; time: string }[];
  };
  return res.available_slots[0];
}

beforeEach(() => {
  blobStore.clear();
  vi.mocked(notifyShop).mockClear();
  vi.mocked(notifyShop).mockResolvedValue({ sent: true });
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("booking executor notifies the shop", () => {
  it("a successful booking sends exactly one 'booking' notification", async () => {
    const slot = await firstSlot();
    const result = await execBookingTool(
      CLIENT,
      BOOK_SLOT_TOOL,
      { ...slot, customer_name: "Ola", customer_phone: "98361774", service: "EU-kontroll — VW Golf, AB 12345" },
      "sandbox",
    );

    expect(result.success).toBe(true);
    expect(notifyShop).toHaveBeenCalledTimes(1);
    expect(notifyShop).toHaveBeenCalledWith(
      CLIENT,
      expect.objectContaining({
        kind: "booking",
        date: slot.date,
        time: slot.time,
        customerPhone: "98361774",
        service: "EU-kontroll — VW Golf, AB 12345",
        scope: "sandbox",
      }),
    );
  });

  it("a failed booking sends nothing", async () => {
    const result = await execBookingTool(
      CLIENT,
      BOOK_SLOT_TOOL,
      { date: "2020-01-01", time: "99:99", customer_name: "X", customer_phone: "1", service: "Y" },
      "sandbox",
    );
    expect(result.success).toBe(false);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("a note on an existing booking sends a 'note' notification", async () => {
    const slot = await firstSlot();
    await execBookingTool(
      CLIENT,
      BOOK_SLOT_TOOL,
      { ...slot, customer_name: "Ola", customer_phone: "98361774", service: "EU-kontroll" },
      "sandbox",
    );
    vi.mocked(notifyShop).mockClear();

    const res = await execBookingTool(
      CLIENT,
      ADD_NOTE_TOOL,
      { ...slot, customer_phone: "98361774", note: "Ønsker pris på bremser" },
      "sandbox",
    );

    expect(res.success).toBe(true);
    expect(notifyShop).toHaveBeenCalledTimes(1);
    expect(notifyShop).toHaveBeenCalledWith(
      CLIENT,
      expect.objectContaining({ kind: "note", note: "Ønsker pris på bremser" }),
    );
  });

  // notifyShop's contract is "never throws" — but if it ever does anyway,
  // the model must still be told the booking succeeded, because it DID.
  it("a throwing notifier does not turn a successful booking into an error", async () => {
    vi.mocked(notifyShop).mockRejectedValueOnce(new Error("resend down"));
    const slot = await firstSlot();
    const result = await execBookingTool(
      CLIENT,
      BOOK_SLOT_TOOL,
      { ...slot, customer_name: "Ola", customer_phone: "98361774", service: "EU-kontroll" },
      "sandbox",
    );
    // The .catch on the notify call is what keeps this true: the booking
    // stored, so the model must report success no matter what the mailer did.
    expect(result.success).toBe(true);
  });
});

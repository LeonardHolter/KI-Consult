import { describe, expect, it } from "vitest";
import { conversationStatus } from "@/lib/voiceDemo/conversationStatus";

// The tag is what the shop owner scans instead of reading. Two things must
// hold: a call that produced a booking is never labelled anything else, and
// a call that did NOT produce one is always distinguishable — that set is
// the follow-up list.

const base = {
  toolNames: ["get_available_demo_slots"],
  callSuccessful: "success",
  terminationReason: "end_call tool was called.",
  durationSeconds: 120,
};

describe("conversationStatus", () => {
  it("labels a completed booking", () => {
    expect(
      conversationStatus({ ...base, toolNames: ["get_available_demo_slots", "book_demo_slot", "end_call"] }),
    ).toEqual({ label: "Booking", tone: "booking" });
  });

  it("labels a moved appointment", () => {
    expect(
      conversationStatus({ ...base, toolNames: ["find_my_bookings", "reschedule_booking"] }),
    ).toEqual({ label: "Flyttet time", tone: "booking" });
  });

  it("labels a note added to an existing booking", () => {
    expect(conversationStatus({ ...base, toolNames: ["add_booking_note"] }).label).toBe("Notat");
  });

  // What the agent DID outranks how the call ended: hanging up straight after
  // a confirmed booking is still a booking, and must not land in the
  // follow-up list.
  it("keeps a booking a booking even when the caller hangs up abruptly", () => {
    expect(
      conversationStatus({
        ...base,
        toolNames: ["book_demo_slot"],
        terminationReason: "Client disconnected: 1005",
      }).label,
    ).toBe("Booking");
  });

  it("labels a call that answered a question but booked nothing", () => {
    expect(conversationStatus(base)).toEqual({ label: "Informasjon", tone: "info" });
  });

  it("labels a caller who hung up mid-conversation", () => {
    expect(
      conversationStatus({ ...base, terminationReason: "Client disconnected: 1006" }),
    ).toEqual({ label: "Avbrutt", tone: "warn" });
  });

  it("labels a call the agent's own evaluation failed", () => {
    expect(conversationStatus({ ...base, callSuccessful: "failure" }).tone).toBe("error");
  });

  it("labels a call that never produced audio", () => {
    expect(
      conversationStatus({ ...base, durationSeconds: 0, toolNames: null, callSuccessful: "unknown" }).label,
    ).toBe("Feil");
  });

  it("survives missing fields rather than throwing", () => {
    expect(
      conversationStatus({
        toolNames: null,
        callSuccessful: null,
        terminationReason: null,
        durationSeconds: 60,
      }),
    ).toEqual({ label: "Informasjon", tone: "info" });
  });

  // Every call that did not book must be findable as one — this is the
  // property the follow-up list depends on.
  it("marks every non-booking outcome as something other than Booking", () => {
    const nonBooking = [
      conversationStatus(base),
      conversationStatus({ ...base, terminationReason: "Client disconnected: 1000" }),
      conversationStatus({ ...base, callSuccessful: "failure" }),
    ];
    expect(nonBooking.every((s) => s.tone !== "booking")).toBe(true);
  });
});

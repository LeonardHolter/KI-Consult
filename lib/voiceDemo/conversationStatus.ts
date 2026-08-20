// One status tag per voice call, so a shop owner can scan the call list and
// see what happened without reading anything.
//
// Derived, not stored: ElevenLabs already records which tools ran, how the
// call ended and whether its own evaluation passed, and those answer the
// question better than a summary does. The tags exist mainly to make the
// calls that did NOT end in a booking findable — that list is the follow-up
// list, and a missed ceramic coating is 12 990 kroner.
//
// The summary field is deliberately unused: ElevenLabs writes it in whatever
// language it lands on, so half of them arrive in English and it reads as
// sloppy next to Norwegian UI.

export type StatusTone = "booking" | "info" | "warn" | "error";

export type ConversationStatus = { label: string; tone: StatusTone };

export type StatusInput = {
  toolNames: string[] | null | undefined;
  callSuccessful: string | null | undefined;
  terminationReason: string | null | undefined;
  durationSeconds: number | null | undefined;
};

/** Order matters: what the agent DID outranks how the call ended. A caller
 *  who books and then hangs up abruptly still booked. */
export function conversationStatus(input: StatusInput): ConversationStatus {
  const tools = new Set(input.toolNames ?? []);

  if (tools.has("book_demo_slot")) return { label: "Booking", tone: "booking" };
  if (tools.has("reschedule_booking")) return { label: "Flyttet time", tone: "booking" };
  if (tools.has("add_booking_note")) return { label: "Notat", tone: "info" };

  // The agent's own evaluation of the call, or a call that never produced
  // audio at all — something went wrong and it is worth listening to.
  if (input.callSuccessful === "failure" || (input.durationSeconds ?? 0) <= 0) {
    return { label: "Feil", tone: "error" };
  }

  // Caller hung up rather than the agent closing the call. Short ones are
  // usually a misdial; longer ones are someone who gave up, which is exactly
  // the call worth ringing back.
  const hungUp = (input.terminationReason ?? "").toLowerCase().includes("client disconnected");
  if (hungUp) return { label: "Avbrutt", tone: "warn" };

  return { label: "Informasjon", tone: "info" };
}

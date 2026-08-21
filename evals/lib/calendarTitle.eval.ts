import { describe, expect, it } from "vitest";
import { calendarEventTitle, shortPhone } from "@/lib/calendarTitle";

// The title is the whole event as far as the shop is concerned: Sabah reads
// the calendar grid, not the event detail. So everything he needs to act —
// who, how to reach them, which car, what for — has to survive into it, in
// that order, and nothing he does NOT have may be invented or leave an empty
// separator behind.

describe("calendarEventTitle", () => {
  it("puts name, phone, plate and service in Sabah's order", () => {
    expect(
      calendarEventTitle({
        customerName: "Sander",
        customerPhone: "+4798361774",
        service: "Vask utvendig Basic — VW Golf, AB 12345",
      }),
    ).toBe("Sander · 98 36 17 74 · AB 12345 · Vask utvendig Basic");
  });

  // The plate identifies the exact car in the yard; make and model do not.
  it("prefers the plate over make and model when both are known", () => {
    const title = calendarEventTitle({
      customerName: "Leo",
      customerPhone: "98361774",
      service: "Polering Pro — Tesla Model X, EK 25079",
    });
    expect(title).toContain("EK 25079");
    expect(title).not.toContain("Tesla");
  });

  it("falls back to make and model when no plate was collected", () => {
    expect(
      calendarEventTitle({
        customerName: "Kari",
        customerPhone: "98361774",
        service: "Motorvask — VW Golf, reg.nr tas ved levering",
      }),
    ).toContain("VW Golf");
  });

  it("leaves out what it does not know, without a dangling separator", () => {
    const title = calendarEventTitle({ customerName: "Ola", service: "Hjulskift" });
    expect(title).toBe("Ola · Hjulskift");
    expect(title).not.toContain("··");
    expect(title.endsWith("·")).toBe(false);
  });

  it("still produces a title Google will accept when everything is missing", () => {
    expect(calendarEventTitle({})).toBe("Booking");
  });

  it("keeps an added note visible — that is why it is appended to the service", () => {
    expect(
      calendarEventTitle({
        customerName: "Sander",
        customerPhone: "98361774",
        service: "Vask utvendig Basic — VW Golf, AB 12345 + ønsker vurdering av PDR",
      }),
    ).toContain("PDR");
  });
});

describe("shortPhone", () => {
  it("groups a Norwegian number the way it is read aloud", () => {
    expect(shortPhone("+4798361774")).toBe("98 36 17 74");
    expect(shortPhone("98361774")).toBe("98 36 17 74");
    expect(shortPhone("+47 983 61 774")).toBe("98 36 17 74");
  });

  // Regrouping a foreign number by a Norwegian rule makes it harder to dial,
  // not easier — so it is left exactly as the customer gave it.
  it("leaves a non-Norwegian number alone", () => {
    expect(shortPhone("+46 70 123 45 67")).toBe("+46 70 123 45 67");
  });

  it("survives a missing number", () => {
    expect(shortPhone(undefined)).toBe("");
  });
});

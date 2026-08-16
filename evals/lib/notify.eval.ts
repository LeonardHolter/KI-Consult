import { describe, expect, it } from "vitest";
import { buildShopEmail, labelFor } from "@/lib/notifyEmail";
import { looksLikeEmail } from "@/lib/notify";

// The e-mail is the shop's ONLY view of a booking until they open the portal
// (Namsos reads Consort's overflow mails today; this replaces them). What
// matters: test traffic is unmistakably labeled, the fields the workshop
// needs are all present, and nothing injects HTML.

describe("buildShopEmail", () => {
  const base = {
    kind: "booking" as const,
    date: "2026-08-24",
    time: "08:00",
    customerName: "Ola",
    customerPhone: "98361774",
    service: "EU-kontroll personbil under 3,5 tonn — VW Golf, AB 12345",
    scope: "live" as const,
  };

  it("carries every field the workshop needs, Consort-style", () => {
    const { subject, text } = buildShopEmail("Namsos Bilteknikk AS", base);
    expect(subject).toBe("Ny booking: mandag 24. august kl. 08:00");
    expect(text).toContain("EU-kontroll personbil under 3,5 tonn — VW Golf, AB 12345");
    expect(text).toContain("98361774");
    expect(text).toContain("Ola");
    expect(text).toContain("Namsos Bilteknikk AS");
  });

  it("marks sandbox traffic as TEST in both subject and body", () => {
    const { subject, text } = buildShopEmail("X", { ...base, scope: "sandbox" });
    expect(subject).toMatch(/^\[TEST\] /);
    expect(text).toContain("TESTBOOKING");
    expect(text).toContain("ikke en ekte kunde");
  });

  it("live traffic carries no test markers at all", () => {
    const { subject, text, html } = buildShopEmail("X", base);
    for (const s of [subject, text, html]) expect(s).not.toMatch(/TEST/i);
  });

  it("a reschedule shows both the old and the new time", () => {
    const { subject, text } = buildShopEmail("X", {
      ...base,
      kind: "reschedule",
      oldDate: "2026-08-21",
      oldTime: "10:00",
    });
    expect(subject).toContain("flyttet til mandag 24. august kl. 08:00");
    expect(text).toContain("fredag 21. august kl. 10:00");
  });

  it("a note includes the note text", () => {
    const { text } = buildShopEmail("X", { ...base, kind: "note", note: "Ønsker pris på bremser" });
    expect(text).toContain("Ønsker pris på bremser");
  });

  // The service string is model-authored — it must not become markup.
  it("escapes HTML in model-authored fields", () => {
    const { html } = buildShopEmail("X", { ...base, service: '<img src=x onerror="pwn()">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("labelFor is timezone-stable Norwegian", () => {
    expect(labelFor("2026-12-24", "09:30")).toBe("torsdag 24. desember kl. 09:30");
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses and rejects junk", () => {
    expect(looksLikeEmail("namsosbilteknikk@automester.no")).toBe(true);
    expect(looksLikeEmail("ikke en epost")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

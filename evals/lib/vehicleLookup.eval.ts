import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The plate lookup is what lets the agents price from the registry instead
// of the customer's guess. What matters: the real response shape parses, a
// 204 means "no such plate" (not an error), every failure degrades to
// ask-make-and-model instead of blocking, and the key never leaks into the
// tool result the model sees.

import { lookupVehicle, normalizePlate } from "@/lib/vehicleLookup";
import { execBookingTool, LOOKUP_VEHICLE_TOOL } from "@/lib/bookingTools";

// Trimmed but structurally faithful to the live response for EB 10001.
const VEGVESEN_BODY = {
  kjoretoydataListe: [
    {
      kjoretoyId: { kjennemerke: "EB 10001" },
      godkjenning: {
        tekniskGodkjenning: {
          kjoretoyklassifisering: { beskrivelse: "Personbil" },
          tekniskeData: {
            generelt: { merke: [{ merke: "VOLKSWAGEN" }], handelsbetegnelse: ["GOLF"] },
            vekter: { egenvekt: 1585, tillattTotalvekt: 2020 },
            dimensjoner: { lengde: 4270 },
            karosseriOgLasteplan: { karosseritype: { kodeBeskrivelse: "Stasjonsvogn" } },
          },
        },
      },
    },
  ],
};

beforeEach(() => {
  process.env.VEGVESEN_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VEGVESEN_API_KEY;
});

describe("normalizePlate", () => {
  it("strips spaces and separators, uppercases", () => {
    expect(normalizePlate("eb 10001")).toBe("EB10001");
    expect(normalizePlate("EB-10001")).toBe("EB10001");
  });
});

describe("lookupVehicle", () => {
  it("parses the registry's real response shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VEGVESEN_BODY))));
    const r = await lookupVehicle("eb 10001");
    expect(r).toEqual({
      ok: true,
      vehicle: {
        kjennemerke: "EB 10001",
        merke: "VOLKSWAGEN",
        modell: "GOLF",
        klasse: "Personbil",
        egenvektKg: 1585,
        tillattTotalvektKg: 2020,
        lengdeMm: 4270,
        karosseri: "Stasjonsvogn",
      },
    });
  });

  it("treats 204 as not_found, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await lookupVehicle("ZZ99999")).toEqual({ ok: false, reason: "not_found" });
  });

  it("degrades on network failure and non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await lookupVehicle("EB10001")).toEqual({ ok: false, reason: "error" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    expect(await lookupVehicle("EB10001")).toEqual({ ok: false, reason: "error" });
  });

  it("reports not_configured without a key — and never calls out", async () => {
    delete process.env.VEGVESEN_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await lookupVehicle("EB10001")).toEqual({ ok: false, reason: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("lookup_vehicle tool", () => {
  it("returns the vehicle plus a confirm-the-car instruction", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VEGVESEN_BODY))));
    const r = (await execBookingTool("client-x", LOOKUP_VEHICLE_TOOL, {
      registration_number: "EB 10001",
    })) as { success: boolean; vehicle: { merke: string }; note: string };
    expect(r.success).toBe(true);
    expect(r.vehicle.merke).toBe("VOLKSWAGEN");
    expect(r.note).toContain("Bekreft bilen");
  });

  it("a miss tells the model to fall back to make/model, in Norwegian", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const r = (await execBookingTool("client-x", LOOKUP_VEHICLE_TOOL, {
      registration_number: "ZZ99999",
    })) as { success: boolean; error: string };
    expect(r.success).toBe(false);
    expect(r.error).toContain("merke og modell");
  });

  // The model must never see or echo the API key.
  it("the tool result never contains the API key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VEGVESEN_BODY))));
    const r = await execBookingTool("client-x", LOOKUP_VEHICLE_TOOL, {
      registration_number: "EB10001",
    });
    expect(JSON.stringify(r)).not.toContain("test-key");
  });
});

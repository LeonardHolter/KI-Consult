import { describe, expect, it } from "vitest";
import { buildCustomerRows, customersToCsv, parseService } from "@/lib/customers";

// The customer list parses car/plate back out of the shared service string
// (the booking schema stays untouched on purpose — it is shared surface
// area). What matters: both prompt-era formats parse, unknown fields stay
// EMPTY rather than guessed, customers group on normalized phone, and the
// CSV survives Norwegian Excel and hostile field content.

describe("parseService", () => {
  it("parses the current dash format with plate", () => {
    expect(parseService("Vask utvendig Basic — VW Golf, AB 12345")).toEqual({
      service: "Vask utvendig Basic",
      car: "VW Golf",
      regNr: "AB 12345",
    });
  });

  it("parses the plate without space and normalizes it with one", () => {
    expect(parseService("EU-kontroll personbil — Tesla Model Y, EL12345").regNr).toBe("EL 12345");
  });

  it("parses the older chat parenthesis format", () => {
    expect(parseService("Vask utvendig Premium (VW Golf)")).toEqual({
      service: "Vask utvendig Premium",
      car: "VW Golf",
      regNr: "",
    });
  });

  it("drops the reg.nr-tas-ved-levering placeholder instead of calling it a car", () => {
    const p = parseService("Hjulomlegging sesong — Toyota RAV4, reg.nr tas ved levering");
    expect(p.car).toBe("Toyota RAV4");
    expect(p.regNr).toBe("");
  });

  it("leaves car and plate empty when the service carries neither", () => {
    expect(parseService("Polering Basic")).toEqual({ service: "Polering Basic", car: "", regNr: "" });
    expect(parseService(undefined)).toEqual({ service: "", car: "", regNr: "" });
  });
});

describe("buildCustomerRows", () => {
  const b = (over: Record<string, unknown>) => ({
    date: "2026-08-24",
    time: "08:00",
    customerName: "Ola",
    customerPhone: "983 61 774",
    service: "EU-kontroll — VW Golf, AB 12345",
    ...over,
  });

  it("groups differently-formatted phone numbers into one customer", () => {
    const rows = buildCustomerRows([
      b({}),
      b({ date: "2026-07-01", customerPhone: "98361774", service: "Hjulomlegging — VW Golf" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].history).toHaveLength(2);
    expect(rows[0].history[0].date).toBe("24.08.2026"); // newest first
  });

  it("a later booking without plate does not blank an earlier one that had it", () => {
    const rows = buildCustomerRows([
      b({ date: "2026-09-01", service: "Polering Basic" }),
      b({ date: "2026-07-01", service: "EU-kontroll — VW Golf, AB 12345" }),
    ]);
    expect(rows[0].regNr).toBe("AB 12345");
    expect(rows[0].car).toBe("VW Golf");
  });

  it("skips bookings without any phone — no identity to group on", () => {
    expect(buildCustomerRows([b({ customerPhone: undefined })])).toHaveLength(0);
  });

  it("sorts customers by most recent activity", () => {
    const rows = buildCustomerRows([
      b({ customerPhone: "11111111", customerName: "Gammel", date: "2026-01-01" }),
      b({ customerPhone: "22222222", customerName: "Ny", date: "2026-08-25" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Ny", "Gammel"]);
  });
});

describe("customersToCsv", () => {
  it("semicolon-separated with BOM, history joined with dates", () => {
    const csv = customersToCsv(
      buildCustomerRows([
        {
          date: "2026-08-24",
          time: "08:00",
          customerName: "Ola",
          customerPhone: "98361774",
          service: "EU-kontroll — VW Golf, AB 12345",
        },
      ]),
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Navn;Telefonnummer;Bil;Registreringsnummer;Historikk");
    expect(csv).toContain("Ola;98361774;VW Golf;AB 12345;24.08.2026: EU-kontroll");
  });

  it("escapes semicolons and quotes in field content", () => {
    const csv = customersToCsv([
      { name: 'Ola "Bilen" Hansen; AS', phone: "1", car: "", regNr: "", history: [] },
    ]);
    expect(csv).toContain('"Ola ""Bilen"" Hansen; AS";1;;;');
  });
});

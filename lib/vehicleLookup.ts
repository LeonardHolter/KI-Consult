// Vehicle lookup against Statens vegvesen's open single-lookup API
// (Autosys enkeltoppslag). A reg.nr in, the car's identity out — which lets
// the agents PRICE from the plate instead of asking the customer for make
// and model, and doubles as plate verification: read the car back («en
// Volkswagen Golf, stemmer det?») and a misheard plate is caught by the
// customer hearing the wrong car, which beats spelling letters back.
//
// Deliberately returns FACTS, not a size class. The size classification
// (liten/mellomstor/stor) lives in each client's prompt where the humans
// already tuned it — the tool just replaces the customer's guess about
// their own car with the registry's answer.

const BASE = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata";

export type VehicleInfo = {
  /** Normalized plate as the registry writes it, e.g. "EB 10001". */
  kjennemerke: string;
  merke: string | null;
  modell: string | null;
  /** "Personbil", "Varebil", "Lastebil", … */
  klasse: string | null;
  egenvektKg: number | null;
  tillattTotalvektKg: number | null;
  lengdeMm: number | null;
  /** "Stasjonsvogn …", "Kombinertbil", … */
  karosseri: string | null;
};

export function vegvesenConfigured(): boolean {
  return Boolean(process.env.VEGVESEN_API_KEY);
}

/** Digits+letters only, uppercased: "eb 10001" -> "EB10001". */
export function normalizePlate(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, "").toUpperCase();
}

export type VehicleLookupResult =
  | { ok: true; vehicle: VehicleInfo }
  | { ok: false; reason: "not_found" | "not_configured" | "error" };

export async function lookupVehicle(rawPlate: string): Promise<VehicleLookupResult> {
  const key = process.env.VEGVESEN_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  const plate = normalizePlate(rawPlate);
  if (plate.length < 2 || plate.length > 8) return { ok: false, reason: "not_found" };

  let res: Response;
  try {
    res = await fetch(`${BASE}?kjennemerke=${encodeURIComponent(plate)}`, {
      headers: { "SVV-Authorization": `Apikey ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return { ok: false, reason: "error" };
  }
  // 204 = the registry answered "no such vehicle" (not an error).
  if (res.status === 204) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    console.warn(`[vehicleLookup] Vegvesen ${res.status} for plate lookup`);
    return { ok: false, reason: "error" };
  }

  try {
    const body = (await res.json()) as {
      kjoretoydataListe?: Array<{
        kjoretoyId?: { kjennemerke?: string };
        godkjenning?: {
          tekniskGodkjenning?: {
            kjoretoyklassifisering?: { beskrivelse?: string };
            tekniskeData?: {
              generelt?: {
                merke?: Array<{ merke?: string }>;
                handelsbetegnelse?: string[];
              };
              vekter?: { egenvekt?: number; tillattTotalvekt?: number };
              dimensjoner?: { lengde?: number };
              karosseriOgLasteplan?: { karosseritype?: { kodeBeskrivelse?: string } };
            };
          };
        };
      }>;
    };
    const row = body.kjoretoydataListe?.[0];
    if (!row) return { ok: false, reason: "not_found" };
    const tg = row.godkjenning?.tekniskGodkjenning;
    const t = tg?.tekniskeData;
    return {
      ok: true,
      vehicle: {
        kjennemerke: row.kjoretoyId?.kjennemerke ?? plate,
        merke: t?.generelt?.merke?.[0]?.merke ?? null,
        modell: t?.generelt?.handelsbetegnelse?.[0] ?? null,
        klasse: tg?.kjoretoyklassifisering?.beskrivelse ?? null,
        egenvektKg: t?.vekter?.egenvekt ?? null,
        tillattTotalvektKg: t?.vekter?.tillattTotalvekt ?? null,
        lengdeMm: t?.dimensjoner?.lengde ?? null,
        karosseri: t?.karosseriOgLasteplan?.karosseritype?.kodeBeskrivelse ?? null,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

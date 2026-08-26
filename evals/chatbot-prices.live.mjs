#!/usr/bin/env node
// Full price-matrix regression for the Handz On website chatbot, sourced
// row-for-row from the official 2026 brochure («Brosjyre 2026 - Sentralt -
// Disk 11.07.2026.pdf») plus Sabah's mattevask correction (e-post 2026-08-26:
// LB 140 / MB 180 / SB 220 — mattevask står ikke i brosjyren).
//
// Every priced row is asked about with a concrete car; sizes rotate so all
// three columns (LB/MB/SB) get exercised across the suite. «Pris etter
// avtale»-rows must NOT get an invented amount. Like chatbot-behavior.live.mjs
// this hits the real deployed /api/chat: costs money, ~3-4 min. Run:
//   node evals/chatbot-prices.live.mjs [base_url] [client_id]
const BASE = process.argv[2] || "https://www.kiconsult.no";
const CLIENT_ID = process.argv[3] || "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const SUPABASE_URL = "https://verperznjtahrsghoiyb.supabase.co";

let pass = 0, fail = 0;
const conversationIds = [];
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

async function ask(q) {
  const conversationId = uuid();
  conversationIds.push(conversationId);
  const res = await fetch(`${BASE}/api/chat?client=${CLIENT_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], conversationId }),
  });
  return { status: res.status, text: await res.text() };
}

// Amount present as a standalone number (handles «2 390», «2390», «2.390»).
const hasAmount = (text, amount) =>
  new RegExp(`(^|\\D)${amount}(\\D|$)`).test(text.replace(/[\s .]/g, ""));

async function priceTest(name, question, amount, { forbidden = [], mustNotMatch } = {}) {
  const { status, text } = await ask(question);
  const flat = text.replace(/\n/g, " ");
  let ok = status === 200 && hasAmount(text, amount);
  let why = ok ? "" : `fant ikke ${amount}`;
  for (const f of forbidden) if (hasAmount(text, f)) { ok = false; why = `inneholder forbudt beløp ${f}`; }
  if (mustNotMatch && mustNotMatch.test(flat.toLowerCase())) { ok = false; why = `matcher forbudt frase`; }
  if (ok) { console.log(`  ok   - ${name}`); pass++; }
  else { console.log(`  FAIL - ${name} (${why})\n         "${flat.slice(0, 260)}"`); fail++; }
}

async function avtaleTest(name, question) {
  const { status, text } = await ask(question);
  const low = text.toLowerCase();
  const ok = status === 200 && /avtale|kontakt|avdeling|941 77 814/.test(low);
  if (ok) { console.log(`  ok   - ${name}`); pass++; }
  else { console.log(`  FAIL - ${name}\n         "${text.replace(/\n/g, " ").slice(0, 260)}"`); fail++; }
}

console.log(`Full pris-matrise (brosjyre 2026) — ${BASE}\n`);

console.log("-- VASKE PAKKER (Basic) --");
await priceTest("Vask utvendig Basic, liten (Fiat 500) = 540", "Hva koster utvendig Basic-vask på en Fiat 500?", 540);
await priceTest("Vask innvendig Basic, mellomstor (VW Golf) = 790", "Hva koster innvendig Basic-vask på en VW Golf?", 790);
await priceTest("Vask ut- og innvendig Basic, stor (Volvo XC60) = 1190", "Hva koster ut- og innvendig Basic-vask på en Volvo XC60?", 1190, { forbidden: [640] });

console.log("-- VASKE PAKKER (Premium) --");
await priceTest("Vask utvendig Premium, stor (BMW X3) = 990", "Hva koster utvendig Premium-vask på en BMW X3?", 990);
await priceTest("Vask innvendig Premium, liten (VW Up) = 790", "Hva koster innvendig Premium-vask på en VW Up?", 790);
await priceTest("Vask ut- og innvendig Premium, mellomstor (VW Passat) = 1590", "Hva koster ut- og innvendig Premium-vask på en VW Passat?", 1590, { forbidden: [890] });

console.log("-- ANNEN VASK --");
await priceTest("Motorvask, liten (Toyota Aygo) = 590", "Hva koster motorvask på en Toyota Aygo?", 590);
await priceTest("Motorvask, stor (Tesla Model Y... nei, XC60) = 690", "Hva koster motorvask på en Volvo XC60?", 690);
await priceTest("Mattevask, liten (Toyota Aygo) = 140", "Hva koster det å vaske mattene på en Toyota Aygo?", 140, { mustNotMatch: /uansett/ });
await priceTest("Mattevask, mellomstor (VW Golf) = 180", "Hva koster mattevask på en VW Golf?", 180, { mustNotMatch: /uansett/ });
await priceTest("Mattevask, stor (Volvo XC60) = 220", "Hva koster det å få vasket mattene i en Volvo XC60?", 220);
await priceTest("Vask av skiboks = 100", "Hva koster det å vaske en skiboks?", 100);

console.log("-- POLERING --");
await priceTest("Polering Basic, mellomstor (VW Golf) = 2390", "Hva koster Polering Basic på en VW Golf?", 2390);
await priceTest("Polering Pro, liten (Fiat 500) = 2990", "Hva koster Polering Pro på en Fiat 500?", 2990);
await priceTest("Lakkrens + Polering Basic, stor (BMW X3) = 4490", "Hva koster Lakkrens pluss Polering Basic på en BMW X3?", 4490);
await priceTest("Lakkrens + Polering Pro, mellomstor (VW Golf) = 4990", "Hva koster Lakkrens pluss Polering Pro på en VW Golf?", 4990);
await priceTest("Ekstra ripefjerning = 1090 per time", "Hva koster ekstra ripefjerning per time?", 1090);

console.log("-- KERAMISK LAKKFORSEGLING --");
await priceTest("Keramisk, liten (VW Up) = 9990", "Hva koster keramisk lakkforsegling på en VW Up?", 9990);
await priceTest("Keramisk, mellomstor (Tesla Model 3) = 11590", "Hva koster keramisk lakkforsegling på en Tesla Model 3?", 11590);
await priceTest("Keramisk, stor (BMW X3) = 12990", "Hva koster keramisk lakkforsegling på en BMW X3?", 12990);
await priceTest("Årskontroll keramisk, mellomstor (VW Golf) = 1890", "Hva koster årskontroll av keramisk lakkforsegling for en VW Golf?", 1890);

console.log("-- FULL SHINE --");
await priceTest("Full Shine Basic, mellomstor (VW Passat) = 6990", "Hva koster Full Shine Basic på en VW Passat?", 6990);
await priceTest("Full Shine Pro, stor (Volvo XC60) = 8490", "Hva koster Full Shine Pro på en Volvo XC60?", 8490);

console.log("-- INTERIØR --");
await priceTest("Rens innvendig, liten (Fiat 500) = 3990", "Hva koster en komplett innvendig rens på en Fiat 500?", 3990);
await priceTest("Skinnrens og behandling, mellomstor (VW Passat) = 2390", "Hva koster skinnrens og behandling på en VW Passat?", 2390);
await priceTest("Rens av enkelt sete = fra 590", "Hva koster rens av ett enkelt sete?", 590);
await priceTest("Rens av flekker = fra 390", "Hva koster flekkfjerning i interiøret?", 390);
await priceTest("Fjerning av dyrehår = fra 490", "Hva koster fjerning av dyrehår i bilen?", 490);
await priceTest("Ozonrens = 1690 uansett størrelse (stor SUV)", "Hva koster ozonrens i en stor SUV som BMW X5?", 1690, { forbidden: [2090] });

console.log("-- HJUL --");
await priceTest("Skift av hjul, mellomstor (VW Golf) = 550", "Hva koster skift av hjul på en VW Golf?", 550);
await priceTest("Vask av hjul, stor (BMW X3) = 350", "Hva koster vask av hjul på en BMW X3?", 350);
await priceTest("Omlegg og balansering, liten (Toyota Aygo) = 1300", "Hva koster omlegg og balansering av fire hjul på en Toyota Aygo?", 1300);

console.log("-- TILBEHØR OG ANNET --");
await priceTest("Fjerning av salt og asfalt = fra 800", "Hva koster fjerning av salt og asfalt?", 800);
await priceTest("Spylervæske-påfyll = 90", "Hva koster påfyll av spylervæske?", 90);

console.log("-- PRIS ETTER AVTALE (aldri funnet-på beløp) --");
await avtaleTest("Skift av lyspærer → etter avtale", "Hva koster det å skifte lyspærer?");
await avtaleTest("Viskerblader → etter avtale", "Hva koster nye viskerblader?");
await avtaleTest("PDR/småbulk → etter avtale", "Hva koster det å rette en liten bulk uten lakkering?");
await avtaleTest("Foliering → etter avtale", "Hva koster foliering av utsatte steder?");
await avtaleTest("Avbalansering/dekkhotell → etter avtale", "Hva koster dekkhotell hos dere?");

console.log(`\n${pass} passed, ${fail} failed`);

const KEY = process.env.SUPABASE_SECRET_KEY;
if (KEY && conversationIds.length) {
  const idList = conversationIds.map((id) => `"${id}"`).join(",");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=in.(${idList})`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  console.log(`Cleaned up ${conversationIds.length} test conversations (HTTP ${res.status}).`);
}
process.exit(fail > 0 ? 1 : 0);

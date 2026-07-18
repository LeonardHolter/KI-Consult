#!/usr/bin/env node
// Live behavioral regression tests for the Handz On chat bot, derived
// directly from Sabah O. Ali's documented test feedback (email thread with
// Leonard, 2026-07-08 through 2026-07-16). Each check below traces to a
// specific request/fix confirmed in that thread — see the comment above
// each test.
//
// Unlike npm run eval (mocked, fast, free), this hits the REAL deployed
// /api/chat endpoint with real Claude calls: costs money, takes ~1-2 min,
// and LLM phrasing can vary between runs. Run it explicitly, never as part
// of the regular eval suite (hence .live.mjs, not .eval.ts — the vitest
// config only picks up *.eval.ts / *.test.ts).
//
// Usage: node evals/chatbot-behavior.live.mjs [base_url] [client_id]
//   defaults: http://localhost:3001, Handz On Strømmen's client id
//
// Set SUPABASE_SECRET_KEY to auto-clean the test conversations this script
// creates; otherwise their ids are printed at the end for manual cleanup.

const BASE = process.argv[2] || "http://localhost:3001";
const CLIENT_ID = process.argv[3] || "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const SUPABASE_URL = "https://verperznjtahrsghoiyb.supabase.co";

let pass = 0;
let fail = 0;
let pending = 0;
const conversationIds = [];

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function chat(turns) {
  const conversationId = uuid();
  conversationIds.push(conversationId);
  const res = await fetch(`${BASE}/api/chat?client=${CLIENT_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: turns, conversationId }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const contains = (s) => (text) => text.toLowerCase().includes(s.toLowerCase());

async function test(name, userMessageOrTurns, checkFn, { pendingFeature } = {}) {
  try {
    const turns = Array.isArray(userMessageOrTurns)
      ? userMessageOrTurns
      : [{ role: "user", content: userMessageOrTurns }];
    const { status, text } = await chat(turns);
    if (status !== 200) {
      console.log(`  FAIL - ${name} (HTTP ${status}): ${text.slice(0, 200)}`);
      fail++;
      return;
    }
    if (checkFn(text)) {
      console.log(`  ok   - ${name}`);
      pass++;
    } else if (pendingFeature) {
      console.log(`  PENDING - ${name} (${pendingFeature}, not yet implemented — not a regression)`);
      pending++;
    } else {
      console.log(`  FAIL - ${name}\n         reply: "${text.replace(/\n/g, " ").slice(0, 300)}"`);
      fail++;
    }
  } catch (e) {
    console.log(`  FAIL - ${name} (error): ${e.message}`);
    fail++;
  }
}

console.log(`Chat bot behavior regression — ${BASE}, client ${CLIENT_ID}`);
console.log("Requirements sourced from Sabah's test feedback, email thread 2026-07-08 to 2026-07-16.\n");

// --- Branding: deterministic, read straight from the public embed.js output
// (no LLM call, no flakiness) rather than probing conversationally. ---
console.log("-- Branding --");
{
  const res = await fetch(`${BASE}/embed.js?client=${CLIENT_ID}`);
  const js = await res.text();
  const m = /var WELCOME = (".*?");/.exec(js);
  const welcome = m ? JSON.parse(m[1]) : "";
  console.log(`  current welcome message: "${welcome}"`);
  // Sabah, 2026-07-16: proposed replacing the current welcome with one that
  // says "velkommen til Handz On" and "Jeg heter Hanz og er ... digitale
  // assistent" instead of the terser current wording.
  const matchesRewrite = welcome.includes("velkommen til Handz On") && welcome.includes("digitale assistent");
  if (matchesRewrite) {
    console.log("  ok   - welcome message matches Sabah's requested rewrite (2026-07-16)");
    pass++;
  } else {
    console.log("  PENDING - welcome message not yet updated to Sabah's requested rewrite (2026-07-16, not yet implemented)");
    pending++;
  }
}

console.log("\n-- Identity (Leonard, 2026-07-13: bot now named Hanz) --");
await test("Introduces itself as Hanz when asked directly", "Hvem er du?", contains("hanz"));

console.log("\n-- Directions (Leonard, 2026-07-13: 'kjør ned' -> 'kjør opp' to P3) --");
await test(
  "Gives directions as 'opp til plan P3', not 'ned'",
  "Hvor ligger Strømmen avdeling og hvordan kommer jeg dit?",
  // Loosened from one exact contiguous phrase: Claude sometimes bolds "P3"
  // (**P3**), which breaks a strict "plan p3" substring match without the
  // directions actually being wrong. Check "opp"/"p3" independently instead.
  (t) => contains("opp")(t) && contains("p3")(t) && !contains("kjør ned")(t),
);

console.log("\n-- Booking rules --");
// Leonard, 2026-07-13: "Hanz tilbyr ikke lenger timer før kl. 09:30."
await test(
  "Never offers a slot before opening (09:30)",
  "Kan jeg få time kl 08:00 i morgen?",
  (t) => !/\b08[:.]00\b/.test(t) || contains("09:30")(t),
);
// Leonard, 2026-07-13: "innvendig" must be disambiguated (vask vs. rens)
// before a price is given — Sabah's 2026-07-16 transcript still shows one
// slip on this (lakkforsegling follow-up), so this is worth pinning down.
await test(
  "Asks vask vs. rens before pricing an ambiguous 'innvendig' request",
  "Hva koster innvendig?",
  (t) => contains("rens")(t) && contains("vask")(t) && !/\d{3,4}\s*kr/.test(t),
);
// Sabah, 2026-07-11 (exact required wording, including the trailing link
// with no punctuation glued to it); Leonard, 2026-07-13: implemented.
await test(
  "Refuses to book at other departments with the exact required phrase, link intact",
  "Kan jeg booke time i Sandvika?",
  contains(
    "jeg er en testagent som foreløpig jobber kun med strømmen-avdelingen. for bestillinger til andre avdelinger ber jeg deg kontakte avdelingen direkte https://handzon.no/avdelinger",
  ),
);
// Leonard, 2026-07-13: "Hanz motsier ikke lenger seg selv" on Smart Repair/PDR.
await test(
  "Offers to note Smart Repair/PDR without later contradicting itself",
  "Tilbyr dere bulk oppretting?",
  (t) => contains("smart repair")(t) && !contains("kan ikke legge til")(t),
);

console.log("\n-- Links (Leonard, 2026-07-13: no punctuation glued to a link) --");
// The actual 2026-07-11 bug ("Punk etter kontakt må fjernes for at lenken
// fungerer") was in embed.js's markdown link-detection, which greedily
// swallowed trailing sentence punctuation into the href. The fix is
// client-side rendering logic, not prompt wording — check it deterministically
// in the served script rather than trying to provoke the exact backend error
// path that happened to surface it in Sabah's test.
{
  const res = await fetch(`${BASE}/embed.js?client=${CLIENT_ID}`);
  const js = await res.text();
  if (js.includes("[.,;:!?]+$")) {
    console.log("  ok   - embed.js still strips trailing punctuation from auto-linked URLs");
    pass++;
  } else {
    console.log("  FAIL - embed.js's link-detection no longer strips trailing punctuation (regression risk for the 2026-07-11 bug)");
    fail++;
  }
}

console.log("\n-- Pricing & durations --");
// Leonard, 2026-07-16: "utvendig vask ca. 1 time, innvendig vask ca. 1 time,
// ut-/innvendig ca. 1,5 time" (replacing vague "i underkant av et par timer").
await test("States utvendig vask takes ~1 time", "Hvor lang tid tar utvendig vask?", contains("1 time"));
await test("States innvendig vask takes ~1 time", "Hvor lang tid tar innvendig vask?", contains("1 time"));
await test("States ut- og innvendig vask takes ~1,5 time", "Hvor lang tid tar ut- og innvendig vask?", contains("1,5 time"));
// Sabah, 2026-07-16 (latest email): gave the figure, asked Leonard to add it —
// not yet in the knowledge base as of this migration.
await test(
  "States motorvask takes ~30–45 minutter",
  "Hvor lang tid tar motorvask?",
  (t) => contains("30")(t) && contains("45")(t),
  { pendingFeature: "Sabah's 2026-07-16 email — figure provided, not yet added to the knowledge base" },
);
// Leonard, 2026-07-16: Hanz now states the >9H hardness proactively.
await test("States ceramic coating hardness is >9H", "Hva er H-graden på keramisk lakkforsegling?", contains("9h"));
// Leonard, 2026-07-16: redirect to Min Side with Sabah's suggested phrasing.
await test("Redirects lakkforsegling offer question to Min Side", "Har dere tilbud på lakkforsegling nå?", contains("min side"));

console.log("\n-- Stability (Leonard, 2026-07-13: long-conversation crash fixed) --");
{
  const turns = [
    { role: "user", content: "Hei" },
    { role: "assistant", content: "Hei, og velkommen til Handz On Strømmen Senter. Hva kan vi hjelpe deg med?" },
    { role: "user", content: "Hva koster utvendig vask?" },
    { role: "assistant", content: "Hvilken bil gjelder det?" },
    { role: "user", content: "VW Golf" },
    { role: "assistant", content: "En VW Golf regnes som mellomstor bil, så utvendig vask Basic blir 590 kr." },
    { role: "user", content: "Og polering?" },
    { role: "assistant", content: "Polering Basic blir 2390 kr for en mellomstor bil." },
    { role: "user", content: "Hva med lakkforsegling?" },
    { role: "assistant", content: "Keramisk Lakkforsegling for mellomstor bil koster 11 590 kr." },
    { role: "user", content: "Kan jeg få en kort oppsummering av alt du nevnte?" },
  ];
  const { status, text } = await chat(turns);
  const crashed = status !== 200 || contains("beklager, noe gikk galt")(text);
  if (!crashed) {
    console.log("  ok   - 10+ turn conversation completes without 'Beklager, noe gikk galt'");
    pass++;
  } else {
    console.log(`  FAIL - long conversation crashed or errored (HTTP ${status}): ${text.slice(0, 200)}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed, ${pending} pending (known gaps, not regressions)`);

// Clean up the test conversations this run created so production logs stay
// real-customer-only, same courtesy as the manual curl tests earlier.
const KEY = process.env.SUPABASE_SECRET_KEY;
if (KEY && conversationIds.length) {
  const idList = conversationIds.map((id) => `"${id}"`).join(",");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=in.(${idList})`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  console.log(`\nCleaned up ${conversationIds.length} test conversations (HTTP ${res.status}).`);
} else if (conversationIds.length) {
  console.log(
    `\n${conversationIds.length} test conversations were created and NOT auto-cleaned (set SUPABASE_SECRET_KEY to enable this). ids:\n` +
      conversationIds.join("\n"),
  );
}

process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
// Knowledge-parity check between the Handz On CHAT bot prompt and the
// VOICE agent prompt.
//
// Why this exists: the voice prompt was written once (supabase/005) as a
// speech-shaped port of the chat prompt, then drifted. When Sabah asked for
// motorvask's duration (~30-45 min) and that shipped to the chat bot on
// 2026-07-17, the voice prompt kept saying "no exact time" — the voice agent
// would have quoted a different answer than the chat bot for the same
// question. Nothing caught it, because nothing compared them.
//
// This does. Both prompts are admin-editable at runtime (chat via
// /portal/chat-bot, voice via /portal/voice-demo), so the authoritative
// comparison is DB-row vs DB-row. If the voice row doesn't exist yet
// (migration 005 not applied), it falls back to parsing the seed prompt out
// of the migration file so this is still useful pre-apply.
//
// Deliberate NON-parity, asserted rather than ignored: the voice prompt must
// NOT mention get_available_demo_slots / book_demo_slot. The Realtime session
// wires up no tools at all, and OpenAI's realtime prompting guide warns that
// naming absent tools degrades responses.
//
// Unlike chatbot-behavior.live.mjs this makes no LLM calls — it's a pure
// text diff, so it's fast and free. Still .live.mjs (not .eval.ts) because it
// needs network + a Supabase key, so it stays out of the vitest suite.
//
// Usage: SUPABASE_SECRET_KEY=... node evals/voice-prompt-parity.live.mjs [client_id] [--source=db|file]
//   --source=db   (default) check the live voice_demo_settings row; this is
//                 what customers actually hear
//   --source=file check the seed prompt in supabase/005 instead — use this to
//                 validate a prompt revision BEFORE applying the migration

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const SOURCE = (args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "db").toLowerCase();
const CLIENT_ID = args.find((a) => !a.startsWith("--")) || "ad19951e-00e1-4293-8975-6c6bb1dbdad7";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://verperznjtahrsghoiyb.supabase.co";
const KEY = process.env.SUPABASE_SECRET_KEY;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(REPO, "supabase/005_voice_demo_multi_client.sql");

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok   - ${name}`);
    pass++;
  } else {
    console.log(`  FAIL - ${name}${detail ? `\n           ${detail}` : ""}`);
    fail++;
  }
}

async function rest(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Every "a / b / c" price triple, as a set of "a/b/c" strings. */
function priceTriples(text) {
  const out = new Set();
  const re = /(\d{2,5})\s*\/\s*(\d{2,5})\s*\/\s*(\d{2,5})/g;
  let m;
  while ((m = re.exec(text))) out.add(`${m[1]}/${m[2]}/${m[3]}`);
  return out;
}

// Facts that must appear in BOTH prompts. Each entry is [label, chatRegex,
// voiceRegex] — the two regexes differ only where speech formatting legitimately
// differs (e.g. the voice prompt spells the phone number for digit-by-digit
// delivery, and writes "over ni H" where chat writes "over 9H").
const FACTS = [
  ["motorvask ~30-45 min", /30\s*[–-]\s*45|30 til 45/, /30\s*[–-]\s*45|30 til 45/],
  ["ozon/klimarens 1690", /Ozon[^\n]*1690/i, /Ozon[^\n]*1690/i],
  ["vask av skiboks 100", /skiboks:?\s*100/i, /skiboks:?\s*100/i],
  ["ekstra ripefjerning 1090", /ripefjerning:?\s*1090/i, /ripefjerning:?\s*1090/i],
  ["spylervæske 90", /[Ss]pylervæske[^\n]*\b90\b/, /[Ss]pylervæske[^\n]*\b90\b/],
  ["salt og asfalt fra 800", /salt og asfalt:?\s*fra\s*800/i, /salt og asfalt:?\s*fra\s*800/i],
  ["rens av enkelt sete fra 590", /enkelt sete:?\s*fra\s*590/i, /enkelt sete:?\s*fra\s*590/i],
  ["rens av flekker fra 390", /flekker:?\s*fra\s*390/i, /flekker:?\s*fra\s*390/i],
  ["fjerning av dyrehår fra 490", /dyrehår:?\s*fra\s*490/i, /dyrehår:?\s*fra\s*490/i],
  ["ceramic hardness > 9H", /over 9H/i, /over 9H|over ni H/i],
  ["klarlakk 4H-5H reference", /4H\s*[–-]\s*5H/i, /4H\s*[–-]\s*5H|fire til fem H/i],
  ["siste oppdrag 19:30", /19[:.]30/, /19[:.]30/],
  ["lørdag siste oppdrag 17:30", /17[:.]30/, /17[:.]30/],
  ["åpner 09:30", /09[:.]30/, /09[:.]30/],
  ["maks 2 enkle per time", /maks 2 enkle/i, /maks 2 enkle/i],
  ["Full Shine maks 1-2 per dag", /Full Shine:?\s*maks 1\s*[–-]?\s*(til )?2/i, /Full Shine:?\s*maks 1\s*[–-]?\s*(til )?2/i],
  ["7-timers regel for store jobber", /7 timer før stenging/i, /7 timer før stenging/i],
  ["verveordning 20 %", /20\s*%|20 prosent/, /20\s*%|20 prosent/],
  ["kundeklubb: hver 6. gratis", /hver 6\.|hver sjette/i, /hver 6\.|hver sjette/i],
  ["«testagent»-frasen for andre avdelinger", /testagent/, /testagent/],
  ["avdelingstelefon 941 77 814", /941\s*77\s*814/, /941\s*77\s*814|ni-fire-en/],
  ["plan P3 veibeskrivelse", /P3/, /P3/],
  ["«innvendig» er tvetydig-regelen", /tvetydig/i, /tvetydig/i],
];

async function main() {
  if (!KEY) {
    console.error("SUPABASE_SECRET_KEY is required.");
    process.exit(2);
  }

  console.log(`Voice/chat prompt parity — client ${CLIENT_ID}\n`);

  const chatRow = await rest(
    "chat_bot_settings",
    `client_id=eq.${CLIENT_ID}&select=instructions`,
  );
  if (!chatRow?.instructions) {
    console.error("Could not read chat_bot_settings.instructions — aborting.");
    process.exit(2);
  }
  const chat = chatRow.instructions;

  function seedFromMigration() {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const m = sql.match(/\$voiceprompt\$([\s\S]*)\$voiceprompt\$/);
    if (!m) return null;
    return m[1];
  }

  // Default to the live row — that's what customers actually hear. --source=file
  // checks the migration seed instead, to validate a revision before applying.
  let voice = null;
  let source = "";
  if (SOURCE === "file") {
    voice = seedFromMigration();
    if (!voice) {
      console.error("No seed prompt found in supabase/005 — aborting.");
      process.exit(2);
    }
    source = "supabase/005 seed (NOT what is live)";
  } else {
    const voiceRow = await rest(
      "voice_demo_settings",
      `client_id=eq.${CLIENT_ID}&select=instructions`,
    );
    if (voiceRow?.instructions) {
      voice = voiceRow.instructions;
      source = "voice_demo_settings row (LIVE)";
    } else {
      voice = seedFromMigration();
      if (!voice) {
        console.error("No live voice row AND no seed prompt in migration 005 — aborting.");
        process.exit(2);
      }
      source = "supabase/005 seed (migration NOT yet applied)";
    }
  }
  console.log(`  chat prompt:  chat_bot_settings row (${chat.length} chars)`);
  console.log(`  voice prompt: ${source} (${voice.length} chars)\n`);

  console.log("-- prices --");
  const c = priceTriples(chat);
  const v = priceTriples(voice);
  const onlyChat = [...c].filter((x) => !v.has(x));
  const onlyVoice = [...v].filter((x) => !c.has(x));
  check(
    `all ${c.size} chat price triples present in voice prompt`,
    onlyChat.length === 0,
    onlyChat.length ? `missing from voice: ${onlyChat.join(", ")}` : "",
  );
  check(
    "voice prompt invents no prices the chat bot doesn't have",
    onlyVoice.length === 0,
    onlyVoice.length ? `only in voice: ${onlyVoice.join(", ")}` : "",
  );

  console.log("\n-- facts, rules and durations --");
  for (const [label, cre, vre] of FACTS) {
    const inChat = cre.test(chat);
    const inVoice = vre.test(voice);
    check(
      label,
      inChat && inVoice,
      inChat && !inVoice
        ? "present in chat prompt, MISSING from voice prompt"
        : !inChat && inVoice
          ? "present in voice prompt, missing from chat prompt (chat may have changed)"
          : !inChat && !inVoice
            ? "missing from BOTH — fact may have been removed upstream"
            : "",
    );
  }

  // Speech-shape invariants: things that are correct in chat but must never
  // reach a text-to-speech prompt.
  console.log("\n-- voice prompt is speech-shaped --");
  const emoji = voice.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  check("no emoji in voice prompt", emoji.length === 0, emoji.length ? `found: ${emoji.join(" ")}` : "");
  const urls = voice.match(/https?:\/\//g) || [];
  check("no raw http(s) URLs to read aloud", urls.length === 0, urls.length ? `found ${urls.length}` : "");

  // The guide's Tool Selection warning cuts both ways: the prompt must name
  // exactly the tools the session actually wires up (lib/bookingTools.ts),
  // no more and no fewer.
  console.log("\n-- tools match what the session actually wires up --");
  for (const tool of ["get_available_demo_slots", "book_demo_slot"]) {
    check(`voice prompt documents ${tool}`, voice.includes(tool));
    check(`chat prompt documents ${tool}`, chat.includes(tool));
  }
  check(
    "voice prompt no longer claims it cannot reach the calendar",
    !/ikke tilgang til kalenderen/i.test(voice),
    "prompt still says it has no calendar access, but booking tools are now wired up",
  );
  check(
    "voice prompt waits for success:true before confirming a booking",
    /success: ?true/i.test(voice),
  );

  // Regression: the agent once called book_demo_slot right after the caller
  // said "ja" to a NAME correction mid-conversation, not to the full booking
  // summary — and booked with a phone number the caller had just said was
  // wrong. These assert the hardened gate (full-summary readback, ONE
  // combined "stemmer alt dette?", and a fresh readback+yes after any
  // correction) is present, not just any confirmation language.
  console.log("\n-- booking confirmation gate is hardened against partial 'ja' --");
  check(
    "voice prompt requires the FULL summary in one turn before booking",
    /HELE oppsummeringen samlet/i.test(voice),
  );
  check(
    "voice prompt uses one unambiguous confirmation question",
    /Stemmer alt dette\?/i.test(voice),
  );
  check(
    "voice prompt explicitly rejects a partial 'ja' (name/time only) as booking confirmation",
    /TELLER IKKE som bookingbekreftelse/i.test(voice),
  );
  check(
    "voice prompt requires a FRESH yes after any correction, not the old one",
    /et gammelt ja fra før rettelsen gjelder ikke lenger/i.test(voice),
  );

  // Regression: a fragmented/false VAD turn transcribed to a stray filler
  // word ("nydelig" — one of the agent's own acknowledgement words) right
  // after "hva er fullt navn?", and the agent used it as the customer's
  // name without question. Asserts the prompt tells it to be suspicious of
  // a name-shaped answer that clearly isn't one, and ask again instead.
  console.log("\n-- rejects implausible names/phone numbers instead of guessing --");
  check(
    "voice prompt has an explicit 'implausible answer' rule for the name question",
    /MISTENKELIG SVAR PÅ NAVNESPØRSMÅLET/i.test(voice),
  );
  check(
    "the implausible-name rule is also referenced from the Kontaktinfo flow step",
    /Lyder svaret IKKE som et navn/i.test(voice),
  );

  console.log("\n-- every turn ends with an explicit next step --");
  check(
    "voice prompt requires each reply to end with a concrete question or next step",
    /Avslutt ALLTID replikken med et tydelig neste steg/i.test(voice),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

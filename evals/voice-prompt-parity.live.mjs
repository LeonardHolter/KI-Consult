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
  // finish_session is voice-only: the Realtime session registers it (the
  // browser intercepts it to hang up), the chat bot has no such tool — so
  // the voice prompt must document it and the chat prompt must NOT mention
  // it (phantom-tool guard in both directions).
  check("voice prompt documents finish_session", voice.includes("finish_session"));
  check(
    "chat prompt does NOT mention finish_session (chat has no such tool)",
    !chat.includes("finish_session"),
  );
  check(
    "voice prompt waits for success:true before confirming a booking",
    /success: ?true/i.test(voice),
  );

  // The booking gate, revised 2026-07-21 per Leonard: the full combined
  // summary («Da leser jeg opp alt ... Stemmer alt dette?») was CUT — every
  // detail is confirmed as it's collected, so the recap only made calls
  // longer. The digit-by-digit phone readback is now the booking trigger.
  // The original hazard (booking on a "ja" aimed at a name correction, with
  // a phone number the caller had just said was wrong) still needs a guard —
  // it just anchors to the number question instead of the summary question.
  console.log("\n-- booking gate: number confirmation triggers, no summary recap --");
  check(
    "voice prompt makes the number confirmation the booking signal",
    /Nummerbekreftelsen ER bookingsignalet/i.test(voice),
  );
  check(
    "voice prompt forbids reading a full booking summary before booking",
    /IKKE les opp noen samlet oppsummering/i.test(voice),
  );
  check(
    "the cut is deliberate: no «Stemmer alt dette?» summary question remains",
    !/Stemmer alt dette\?/i.test(voice),
  );
  check(
    "voice prompt explicitly rejects a partial 'ja' (name/correction) as the booking signal",
    /TELLER IKKE som bookingsignal/i.test(voice),
  );
  check(
    "voice prompt requires a FRESH yes after any correction, not the old one",
    /et gammelt ja fra før rettelsen gjelder ikke/i.test(voice),
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

  // Regression 2026-07-21: TTS read the abbreviation "kl." literally as
  // letters instead of saying "klokken".
  check(
    "voice prompt bans the abbreviation «kl.» in favor of «klokken»",
    /si ALLTID hele ordet «klokken»/i.test(voice),
  );

  // Regression 2026-07-21: the agent labeled a wash "Basic" but quoted 990
  // — the PREMIUM price for that size — after skipping the Basic/Premium
  // question entirely. Right column (size), wrong row (variant).
  console.log("\n-- price precision: right row, and ask Basic vs Premium --");
  check(
    "voice prompt demands the price row match the variant (Basic vs Premium)",
    /Basic og Premium er FORSKJELLIGE linjer/i.test(voice),
  );
  check(
    "voice prompt asks Basic or Premium before quoting when unspecified",
    /spør hvilken av dem det gjelder FØR du oppgir pris/i.test(voice),
  );

  console.log("\n-- every turn ends with an explicit next step --");
  check(
    "voice prompt requires each reply to end with a concrete question or next step",
    /Avslutt ALLTID replikken med et tydelig neste steg/i.test(voice),
  );

  // Regression: gpt-realtime's audio track can end before its transcript —
  // playback metering caught the model voicing the digit readback but
  // dropping a short trailing "Stemmer det?"; the caller never heard the
  // question even though the transcript showed it. The prompt must demand a
  // full standalone confirmation sentence after digit strings, which is far
  // less likely to be dropped by early audio EOS.
  console.log("\n-- digit readbacks end in a full standalone question --");
  check(
    "voice prompt forbids a short tail-question glued to the last digit",
    /EGEN, FULLSTENDIG setning/i.test(voice) && /Har jeg notert riktig nummer\?/i.test(voice),
  );

  // Closing flow per Leonard 2026-07-21: after success:true the agent
  // closes presumptively in ONE turn — booking confirmation + «...ønsker
  // jeg deg en god dag videre!» + finish_session, no «noe mer?» question.
  // The audio-EOS dropped-tail hazard (a merged ~17s closing once lost its
  // whole farewell) is held off by forcing this turn SHORT: max two
  // sentences, directions moved to the slot-selection step. A caller
  // barge-in cancels the pending hangup client-side and step 7 re-closes.
  console.log("\n-- presumptive one-turn closing, kept short --");
  check(
    "closing turn = booking confirmation + «god dag videre» + finish_session together",
    /ønsker jeg deg en god dag videre/i.test(voice) &&
      /kall finish_session i SAMME replikk/i.test(voice),
  );
  check(
    "closing turn is forced short — no directions, max two sentences",
    /maks to setninger/i.test(voice) && /IKKE legg til veibeskrivelse/i.test(voice),
  );
  // Per Leonard 2026-07-22: the agent volunteered the Elkjøp/P3 directions
  // while proposing slots. Directions are answer-only knowledge now.
  check(
    "directions are only given when the caller asks, never volunteered",
    /KUN når kunden spør hvor dere holder til/i.test(voice) &&
      /ALDRI uoppfordret/i.test(voice),
  );
  check(
    "calls never just stop, and never hang up without a spoken farewell",
    /ALDRI bare stoppe/i.test(voice) && /aldri på uten å ha sagt avskjeden/i.test(voice),
  );
  check(
    "barge-in on the farewell continues the call and re-closes later",
    /Avbryter kunden deg mens du sier avslutningen/i.test(voice),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

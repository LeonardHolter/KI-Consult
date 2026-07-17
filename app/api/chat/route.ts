import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import fs from "fs";
import path from "path";
import { bookSlot, loadSlots } from "@/lib/slots";
import { loadSettings } from "@/lib/settings";
import { DEFAULT_CHAT_PROMPT } from "@/lib/chat-prompt";
import { clientIp, corsHeaders, rateLimit } from "@/lib/api-guard";
import { osloParts } from "@/lib/google-calendar";
import { logTurn } from "@/lib/portal-log";

export const runtime = "nodejs";
export const maxDuration = 60;

// Preflight for cross-origin embeds (handzon.no via <script> snippet).
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

const knowledgeBase = fs.readFileSync(
  path.join(process.cwd(), "lib", "knowledge-base.md"),
  "utf-8"
);

// The chatbot prompt is editable from the dashboard; fall back to the default.
async function buildSystemPrompt(): Promise<string> {
  const settings = await loadSettings();
  const base = settings.chatPrompt?.trim() || DEFAULT_CHAT_PROMPT;
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayLabel = new Intl.DateTimeFormat("no", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const nowTime = new Intl.DateTimeFormat("no", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${base}

DAGENS DATO OG KLOKKESLETT (Europe/Oslo): ${todayLabel} (${todayISO}), klokken er nå ${nowTime}. Bruk ALLTID denne linjen — ikke egen hukommelse eller gjetning — når du regner ut hva «i dag», «i morgen», «på fredag» osv. betyr, også når du kaller book_demo_slot. Stemmer ikke en dato du har i minnet med denne linjen: stol på denne linjen.

KUNNSKAPSBASE (referanse for priser og tjenestedetaljer):

${knowledgeBase}`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_available_demo_slots",
    description:
      "Henter ledige timer fra kalenderen hos Handz On. Bruk alltid dette verktøyet før du foreslår tidspunkter til kunden. Bruk near_time når et ønsket tidspunkt ikke er tilgjengelig, for å få de nærmeste alternativene øverst i listen.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: ["string", "null"],
          description: "Filtrer til denne datoen (YYYY-MM-DD). Sett null for å hente alle dager.",
        },
        near_time: {
          type: ["string", "null"],
          description:
            "Klokkeslett (HH:MM) resultatene skal sorteres etter nærhet til — bruk det tidspunktet kunden egentlig ønsket, slik at nærmeste ledige alternativ kommer først. Sett null hvis ikke aktuelt.",
        },
      },
      required: ["date", "near_time"],
      additionalProperties: false,
    },
  },
  {
    name: "book_demo_slot",
    description:
      "Booker en demo-time for kunden. Bruk kun etter at kunden eksplisitt har bekreftet tjeneste, tidspunkt, navn og telefonnummer.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Datoen for timen, format YYYY-MM-DD, nøyaktig som returnert fra get_available_demo_slots",
        },
        time: {
          type: "string",
          description: "Klokkeslettet for timen, format HH:MM, nøyaktig som returnert fra get_available_demo_slots",
        },
        customer_name: { type: "string", description: "Kundens fulle navn" },
        customer_phone: { type: "string", description: "Kundens telefonnummer" },
        service: {
          type: "string",
          description:
            "Tjenesten timen gjelder, f.eks. 'Utvendig vask - Basic', 'Polering', 'Hjulskift'",
        },
      },
      required: ["date", "time", "customer_name", "customer_phone", "service"],
      additionalProperties: false,
    },
  },
];

const WEEKDAYS = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function execTool(name: string, input: unknown): Promise<string> {
  if (name === "get_available_demo_slots") {
    const { date, near_time } = (input ?? {}) as { date?: string | null; near_time?: string | null };
    const now = osloParts(new Date().toISOString());
    let filtered = (await loadSlots())
      .filter((s) => !s.full)
      .filter((s) => s.date !== now.date || s.time > now.time);
    if (date) filtered = filtered.filter((s) => s.date === date);
    let available = filtered.map((s) => {
      const d = new Date(`${s.date}T${s.time}:00`);
      return {
        label: `${s.date === now.date ? "i dag" : WEEKDAYS[d.getDay()]} ${d.getDate()}. ${d.toLocaleString("no", { month: "long" })} kl. ${s.time}`,
        date: s.date,
        time: s.time,
        location: s.location,
        spots_left: s.capacity - s.bookedCount,
        service_restriction: s.serviceKeyword ?? null,
      };
    });
    if (near_time) {
      const targetMin = toMinutes(near_time);
      available = available.sort((a, b) =>
        a.date !== b.date
          ? a.date < b.date
            ? -1
            : 1
          : Math.abs(toMinutes(a.time) - targetMin) - Math.abs(toMinutes(b.time) - targetMin)
      );
    } else {
      available = available.sort((a, b) =>
        a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time < b.time ? -1 : 1
      );
    }
    return JSON.stringify({
      today: now.date,
      current_time: now.time,
      available_slots: available,
      note: "Har et tidspunkt en service_restriction, må du nevne restriksjonen når du foreslår det til kunden. Bruk feltet 'today' til å vite hvilken dato som er i dag. Listen er sortert nærmest 'near_time' først når det er oppgitt.",
    });
  }
  if (name === "book_demo_slot") {
    const { date, time, customer_name, customer_phone, service } = input as {
      date: string;
      time: string;
      customer_name: string;
      customer_phone: string;
      service: string;
    };
    const normalizedTime = time
      .trim()
      .replace(/^(\d):/, "0$1:")
      .slice(0, 5);
    const slot_id = `${date.trim()}-${normalizedTime.replace(":", "")}`;
    const result = await bookSlot(slot_id, customer_name, customer_phone, service);
    return JSON.stringify(
      result.ok
        ? { success: true, slot: result.slot }
        : { success: false, error: result.error }
    );
  }
  return JSON.stringify({ error: `Ukjent verktøy: ${name}` });
}

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Chatboten er ikke konfigurert (mangler API-nøkkel).", {
      status: 500,
      headers: cors,
    });
  }

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return new Response("For mange forespørsler. Prøv igjen om litt.", {
      status: 429,
      headers: { ...cors, "Retry-After": String(rl.retryAfter) },
    });
  }

  let incoming: ChatMessage[];
  let conversationId: string | undefined;
  try {
    const body = await req.json();
    incoming = body.messages;
    // Browser-generated session id used to group turns in the portal. Only a
    // well-formed uuid is accepted — it goes into a uuid column, and a bad one
    // would make every log write fail.
    if (
      typeof body.conversationId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.conversationId
      )
    ) {
      conversationId = body.conversationId;
    }
    if (
      !Array.isArray(incoming) ||
      incoming.length === 0 ||
      // Guard only against clear abuse; long real conversations are windowed
      // below rather than rejected (a hard cap here made the chat "crash"
      // mid-session once a tester passed ~20 back-and-forth turns).
      incoming.length > 400 ||
      !incoming.every(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length <= 4000
      )
    ) {
      return new Response("Ugyldig forespørsel.", { status: 400, headers: cors });
    }
  } catch {
    return new Response("Ugyldig forespørsel.", { status: 400, headers: cors });
  }

  // Capture what the portal needs before windowing rewrites `incoming`.
  const totalMessageCount = incoming.length;
  const lastUserMessage =
    [...incoming].reverse().find((m) => m.role === "user")?.content ?? "";

  // Keep only the most recent turns so a long session stays within model
  // limits and latency. The system prompt carries all the facts, so old
  // small-talk isn't needed. Must start on a user message for the API.
  const MAX_TURNS = 30;
  let windowed = incoming.slice(-MAX_TURNS);
  while (windowed.length && windowed[0].role !== "user") {
    windowed = windowed.slice(1);
  }
  incoming = windowed.length ? windowed : incoming.slice(-1);

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const systemPrompt = await buildSystemPrompt();

  const readable = new ReadableStream({
    async start(controller) {
      const messages: Anthropic.MessageParam[] = [...incoming];
      // Mirrored to the portal once the turn finishes streaming.
      let assistantText = "";
      let bookedThisTurn = false;
      // Summed across every round of the agentic loop below — a single customer
      // message can trigger several model calls (tool use, then the final
      // answer), and the portal's cost tracking needs the whole turn's spend.
      const usage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      };
      try {
        // Agentic loop: stream each assistant turn; execute tools between turns.
        for (let round = 0; round < 6; round++) {
          const stream = client.messages.stream({
            model: "claude-opus-4-8",
            max_tokens: 1024,
            output_config: { effort: "medium" },
            system: [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOLS,
            messages,
          });
          stream.on("text", (t) => {
            assistantText += t;
            controller.enqueue(encoder.encode(t));
          });
          const final = await stream.finalMessage();
          usage.inputTokens += final.usage.input_tokens;
          usage.outputTokens += final.usage.output_tokens;
          usage.cacheCreationInputTokens += final.usage.cache_creation_input_tokens ?? 0;
          usage.cacheReadInputTokens += final.usage.cache_read_input_tokens ?? 0;

          if (final.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: final.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type === "tool_use") {
              let value: string;
              try {
                value = await execTool(block.name, block.input);
              } catch (err) {
                console.error(
                  `Chat tool "${block.name}" feilet:`,
                  err instanceof Error ? err.stack : err,
                  "input:",
                  JSON.stringify(block.input)
                );
                value = JSON.stringify({
                  error: `Verktøyet feilet: ${err instanceof Error ? err.message : "ukjent feil"}`,
                });
              }
              // Mark the conversation as converted only on a booking the tool
              // actually confirmed — not merely on the model attempting one.
              if (block.name === "book_demo_slot") {
                try {
                  if (JSON.parse(value)?.success === true) bookedThisTurn = true;
                } catch {
                  /* non-JSON tool output — not a confirmed booking */
                }
              }
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: value,
              });
            }
          }
          messages.push({ role: "user", content: results });
          // small visual separator between tool rounds
          controller.enqueue(encoder.encode(""));
        }
        controller.close();
      } catch (err) {
        console.error("Chat stream error:", err);
        try {
          controller.enqueue(
            encoder.encode(
              "Beklager, tjenesten er utilgjengelig akkurat nå. Prøv igjen senere, eller kontakt oss på https://handzon.no/kontakt."
            )
          );
          controller.close();
        } catch {
          /* already closed */
        }
      } finally {
        // Mirror the finished turn to the portal. Still not awaited — the
        // customer's reply is already streamed and logging must never delay
        // it — but it has to be handed to `after()` rather than left as a
        // bare floating promise: this code runs once the stream is closed,
        // and on serverless the function is frozen at that point, so a
        // `void logTurn(...)` gets killed mid-fetch and silently logs
        // nothing in production (it only "works" locally because a
        // long-running node process never suspends). `after()` keeps the
        // invocation alive until the promise settles.
        if (conversationId && assistantText.trim()) {
          after(
            logTurn({
              conversationId,
              userMessage: lastUserMessage,
              assistantMessage: assistantText,
              booked: bookedThisTurn,
              usage,
              // +1 for the assistant reply we just produced.
              messageCount: totalMessageCount + 1,
            })
          );
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      ...cors,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

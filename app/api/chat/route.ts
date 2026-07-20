import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { clientIp, corsHeaders, isAllowedOrigin, rateLimit } from "@/lib/api-guard";
import {
  BOOKING_TOOL_SCHEMAS,
  BOOK_SLOT_TOOL,
  execBookingTool,
} from "@/lib/bookingTools";
import { logTurn } from "@/lib/portal-log";
import { logBotEvent } from "@/lib/botEvents";
import { getChatBotSettingsPublic } from "@/lib/chatBot/data";
import type { ChatBotSettings } from "@/lib/chatBot/types";

// The exact out-of-scope deflection phrase from the OMFANG section of the
// prompt (see supabase/006). A reply containing this means a real customer
// asked about something Hanz can't help with — worth surfacing to admins as
// a signal to expand the knowledge base, distinct from a genuine error.
const DEFLECTION_MARKER = "det kan jeg dessverre ikke hjelpe med";

export const runtime = "nodejs";
export const maxDuration = 60;

function clientIdFrom(req: Request): string | null {
  return new URL(req.url).searchParams.get("client");
}

// Preflight for cross-origin embeds (<script> snippet on the client's site).
// Client identity travels as a query param (not the body) specifically so
// it's available here too — a CORS preflight has no body to read.
export async function OPTIONS(req: Request) {
  const clientId = clientIdFrom(req);
  const settings = clientId ? await getChatBotSettingsPublic(clientId) : null;
  const origin = req.headers.get("origin");
  const allowedOrigins = settings?.allowedOrigins ?? [];
  if (clientId && origin && !isAllowedOrigin(origin, allowedOrigins)) {
    after(logBotEvent({ clientId, surface: "chat", type: "cors_rejected", detail: { origin } }));
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, allowedOrigins),
  });
}

function buildSystemPrompt(settings: ChatBotSettings): string {
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
  return `${settings.instructions}

DAGENS DATO OG KLOKKESLETT (Europe/Oslo): ${todayLabel} (${todayISO}), klokken er nå ${nowTime}. Bruk ALLTID denne linjen — ikke egen hukommelse eller gjetning — når du regner ut hva «i dag», «i morgen», «på fredag» osv. betyr, også når du kaller book_demo_slot. Stemmer ikke en dato du har i minnet med denne linjen: stol på denne linjen.

KUNNSKAPSBASE (referanse for priser og tjenestedetaljer):

${settings.knowledgeBase}`;
}

// Anthropic envelope around the shared schemas (lib/bookingTools.ts). The
// voice agent builds an OpenAI Realtime envelope around the exact same
// objects, so the two surfaces cannot be offered different arguments.
const TOOLS: Anthropic.Tool[] = Object.entries(BOOKING_TOOL_SCHEMAS).map(([name, spec]) => ({
  name,
  description: spec.description,
  strict: true,
  input_schema: spec.parameters as Anthropic.Tool["input_schema"],
}));

/** The chat bot always books for real — sandbox is a voice-only concept. */
async function execTool(clientId: string, name: string, input: unknown): Promise<string> {
  return JSON.stringify(await execBookingTool(clientId, name, input, "live"));
}

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const clientId = clientIdFrom(req);
  if (!clientId) {
    return new Response("Mangler ?client=.", { status: 400 });
  }

  const settings = await getChatBotSettingsPublic(clientId);
  if (!settings) {
    return new Response("Ukjent klient.", { status: 404 });
  }

  const cors = corsHeaders(req.headers.get("origin"), settings.allowedOrigins);

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Chatboten er ikke konfigurert (mangler API-nøkkel).", {
      status: 500,
      headers: cors,
    });
  }

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    after(logBotEvent({ clientId, surface: "chat", type: "rate_limited" }));
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
  const systemPrompt = buildSystemPrompt(settings);

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
                value = await execTool(clientId, block.name, block.input);
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
                after(
                  logBotEvent({
                    clientId,
                    surface: "chat",
                    type: "tool_error",
                    detail: { tool: block.name, message: err instanceof Error ? err.message : String(err) },
                  })
                );
              }
              // Mark the conversation as converted only on a booking the tool
              // actually confirmed — not merely on the model attempting one.
              if (block.name === BOOK_SLOT_TOOL) {
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
        after(
          logBotEvent({
            clientId,
            surface: "chat",
            type: "error",
            detail: { message: err instanceof Error ? err.message : String(err) },
          })
        );
        try {
          controller.enqueue(
            encoder.encode("Beklager, tjenesten er utilgjengelig akkurat nå. Prøv igjen senere.")
          );
          controller.close();
        } catch {
          /* already closed */
        }
      } finally {
        if (assistantText.toLowerCase().includes(DEFLECTION_MARKER)) {
          after(
            logBotEvent({
              clientId,
              surface: "chat",
              type: "deflection",
              detail: { userMessage: lastUserMessage.slice(0, 300) },
            })
          );
        }
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
              clientId,
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

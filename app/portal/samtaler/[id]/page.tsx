import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/portal/data";

export const dynamic = "force-dynamic";

const CREAM = "#f3efe4";
const INK = "#16190f";
const GREEN = "#15c07c";
const MUTED = "#9a9a8c";
const DARK = "#08231a";

function clock(iso: string): string {
  return new Intl.DateTimeFormat("no", {
    timeZone: "Europe/Oslo",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const messages = await getMessages(id);

  // Empty means either no such conversation, or one belonging to another client
  // that RLS filtered out. Both are a 404 from the caller's point of view — we
  // don't confirm that someone else's conversation exists.
  if (messages.length === 0) notFound();

  return (
    <main style={{ minHeight: "100vh", background: CREAM, color: INK }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 14, padding: "16px 24px",
          borderBottom: `1px solid ${MUTED}44`, background: "#fff",
        }}
      >
        <Link href="/portal/samtaler" style={{ textDecoration: "none", color: INK, fontSize: 14, fontWeight: 600 }}>
          ‹ Tilbake
        </Link>
        <span style={{ color: MUTED, fontSize: 14 }}>
          {clock(messages[0].created_at)} · {messages.length} meldinger
        </span>
      </header>

      <div
        style={{
          maxWidth: 720, margin: "0 auto", padding: "26px 20px 60px",
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        {messages.map((m) => {
          const mine = m.role === "user";
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "82%",
                background: mine ? DARK : "#fff",
                color: mine ? CREAM : INK,
                border: mine ? "none" : `1px solid ${MUTED}33`,
                borderRadius: 13,
                borderBottomRightRadius: mine ? 4 : 13,
                borderBottomLeftRadius: mine ? 13 : 4,
                padding: "10px 14px",
                fontSize: 14.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <div
                style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em",
                  opacity: 0.55, marginBottom: 3,
                }}
              >
                {mine ? "KUNDE" : "HANZ"}
              </div>
              {m.content}
            </div>
          );
        })}
      </div>
    </main>
  );
}

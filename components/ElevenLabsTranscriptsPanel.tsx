"use client";

import { useCallback, useEffect, useState } from "react";

// Admin review panel for the ElevenLabs pilot: the transcript of every
// conversation with the pilot agent (phone AND dashboard browser calls),
// read live from ElevenLabs via /api/portal/voice-agent/
// elevenlabs-conversations. Companion to VoiceRecordingsPanel — that one has
// the audio (Telnyx records the phone leg), this one has the words.

type ConversationMeta = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  messageCount: number;
  summary: string | null;
};

type Turn = {
  role: "user" | "agent";
  message: string | null;
  timeInCallSecs: number | null;
  toolCalls: string[];
};

const INK = "#16190f";
const MUTED = "#9a9a8c";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m} min ${sec} s` : `${sec} s`;
}

export default function ElevenLabsTranscriptsPanel({ clientId }: { clientId: string }) {
  const [conversations, setConversations] = useState<ConversationMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, Turn[] | "loading" | "error">>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/voice-agent/elevenlabs-conversations?clientId=${clientId}`,
      );
      if (!res.ok) return [];
      return ((await res.json()).conversations ?? []) as ConversationMeta[];
    } catch {
      return [];
    }
  }, [clientId]);

  useEffect(() => {
    void load().then(setConversations);
  }, [load]);

  const openTranscript = async (id: string) => {
    setOpenId(id);
    if (transcripts[id]) return;
    setTranscripts((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const res = await fetch(
        `/api/portal/voice-agent/elevenlabs-conversations?clientId=${clientId}&conversation=${id}`,
      );
      if (!res.ok) throw new Error();
      const { transcript } = await res.json();
      setTranscripts((prev) => ({ ...prev, [id]: transcript as Turn[] }));
    } catch {
      setTranscripts((prev) => ({ ...prev, [id]: "error" }));
    }
  };

  return (
    <section
      style={{
        marginTop: 18,
        border: `1px solid ${MUTED}44`,
        borderRadius: 0,
        background: "#fff",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 15, color: INK }}>
          Transkripsjoner{" "}
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED }}>
            ElevenLabs-pilot
          </span>
        </h3>
        <button
          onClick={() => void load().then(setConversations)}
          style={{
            border: `1px solid ${MUTED}66`,
            background: "transparent",
            borderRadius: 4,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            color: INK,
          }}
        >
          Oppdater
        </button>
      </div>
      <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        Full tekst av hver samtale med pilot-agenten — både telefon og nettleser. Hentes
        direkte fra ElevenLabs; en fersk samtale kan bruke et halvt minutt på å dukke opp.
      </p>

      {conversations === null ? (
        <p style={{ fontSize: 13, color: MUTED }}>Laster …</p>
      ) : conversations.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED }}>
          Ingen samtaler ennå — de dukker opp her etter neste samtale.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {conversations.map((c) => {
            const t = transcripts[c.id];
            const open = openId === c.id;
            return (
              <li key={c.id} style={{ border: `1px solid ${MUTED}33`, borderRadius: 4, padding: "10px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13.5, color: INK }}>{fmtWhen(c.startedAt)}</span>
                  <span style={{ fontSize: 12.5, color: MUTED }}>
                    {fmtDuration(c.durationSeconds)} · {c.messageCount} replikker
                  </span>
                  <button
                    onClick={() => (open ? setOpenId(null) : void openTranscript(c.id))}
                    style={{
                      border: `1px solid ${MUTED}66`,
                      background: "transparent",
                      borderRadius: 4,
                      padding: "4px 12px",
                      fontSize: 12.5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: INK,
                    }}
                  >
                    {open ? "Lukk" : "Les"}
                  </button>
                </div>
                {c.summary && (
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
                    {c.summary}
                  </p>
                )}
                {open && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${MUTED}33`, paddingTop: 10 }}>
                    {t === "loading" || t === undefined ? (
                      <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Henter transkripsjon …</p>
                    ) : t === "error" ? (
                      <p style={{ fontSize: 13, color: "#c2562c", margin: 0 }}>
                        Klarte ikke hente transkripsjonen — prøv igjen.
                      </p>
                    ) : (
                      <div style={{ display: "grid", gap: 6, maxHeight: 380, overflowY: "auto" }}>
                        {t.map((turn, i) => (
                          <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: ".06em",
                                color: turn.role === "agent" ? "#0d6b47" : MUTED,
                                marginRight: 8,
                              }}
                            >
                              {turn.role === "agent" ? "Hanz" : "Kunde"}
                            </span>
                            <span style={{ color: INK }}>{turn.message}</span>
                            {turn.toolCalls.length > 0 && (
                              <span style={{ marginLeft: 8, fontSize: 11.5, color: MUTED, fontFamily: "monospace" }}>
                                [{turn.toolCalls.join(", ")}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

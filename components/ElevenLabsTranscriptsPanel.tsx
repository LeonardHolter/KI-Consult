"use client";

import { useCallback, useEffect, useState } from "react";
import { FoldButton, useFolded } from "@/components/fold";

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
  status: { label: string; tone: "booking" | "info" | "warn" | "error" };
};

/** One glanceable colour per outcome. Booking is the only green one on
 *  purpose: everything that is not green is a call worth a second look, and
 *  the amber ones are the follow-up list. */
const TONE: Record<string, { fg: string; bg: string }> = {
  booking: { fg: "#0d6b47", bg: "#15c07c22" },
  info: { fg: "#5c5f52", bg: "#9a9a8c22" },
  warn: { fg: "#8a5a00", bg: "#e8a13322" },
  error: { fg: "#c2562c", bg: "#c2562c1f" },
};

function StatusTag({ status }: { status: ConversationMeta["status"] }) {
  const tone = TONE[status?.tone] ?? TONE.info;
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".07em",
        color: tone.fg,
        background: tone.bg,
        borderRadius: 4,
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {status?.label ?? "Ukjent"}
    </span>
  );
}

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

export default function ElevenLabsTranscriptsPanel({
  clientId,
  canDelete,
}: {
  clientId: string;
  /** Admin view only — same rule as the recordings panel: a client reads
   *  their own calls but does not remove review material. */
  canDelete?: boolean;
}) {
  const [conversations, setConversations] = useState<ConversationMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, Turn[] | "loading" | "error">>({});
  const [folded, toggleFolded] = useFolded("transkripsjoner");
  // id of the conversation whose delete button is in its "Sikker?" stage.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(
        `/api/portal/voice-agent/elevenlabs-conversations?clientId=${clientId}&conversation=${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setConversations((prev) => prev?.filter((c) => c.id !== id) ?? prev);
      if (openId === id) setOpenId(null);
    } finally {
      setConfirmDeleteId(null);
    }
  };

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
        <span style={{ display: "inline-flex", gap: 6 }}>
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
        <FoldButton folded={folded} onToggle={toggleFolded} />
        </span>
      </div>
      {!folded && (<>
      <p style={{ margin: "6px 0 12px", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        Full tekst av hver samtale med agenten — både telefon og nettleser. Merket viser
        hva samtalen endte i; alt som ikke er grønt er verdt et blikk. En fersk samtale kan
        bruke et halvt minutt på å dukke opp.
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
                  <span style={{ fontSize: 13.5, color: INK, display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <StatusTag status={c.status} />
                    {fmtWhen(c.startedAt)}
                  </span>
                  <span style={{ fontSize: 12.5, color: MUTED }}>
                    {fmtDuration(c.durationSeconds)} · {c.messageCount} replikker
                  </span>
                  <span style={{ display: "inline-flex", gap: 6 }}>
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
                    {canDelete &&
                      (confirmDeleteId === c.id ? (
                        <button
                          onClick={() => void handleDelete(c.id)}
                          onBlur={() => setConfirmDeleteId(null)}
                          autoFocus
                          style={{
                            border: "1px solid #c2562c66",
                            background: "#c2562c",
                            color: "#fff",
                            borderRadius: 4,
                            padding: "4px 12px",
                            fontSize: 12.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Sikker?
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          title="Slett samtalen hos ElevenLabs"
                          style={{
                            border: "1px solid #c2562c66",
                            background: "transparent",
                            color: "#c2562c",
                            borderRadius: 4,
                            padding: "4px 12px",
                            fontSize: 12.5,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          Slett
                        </button>
                      ))}
                  </span>
                </div>
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
      </>)}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

// Admin review panel for voice-call recordings. Lists what the recordings
// API has stored for this client and plays each one through the
// authenticated streaming route — the storage blobs are private, so the
// <audio> src is our own API, never a storage URL.

type RecordingMeta = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  sizeBytes: number;
  mimeType: string;
  recordedBy?: "admin" | "client";
};

const INK = "#16190f";
const MUTED = "#9a9a8c";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
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

export default function VoiceRecordingsPanel({
  clientId,
  showOrigin,
}: {
  clientId: string;
  /** Admin view: badge client-made calls so real conversations stand out
   *  from admin test calls. Meaningless for the client (they only ever see
   *  their own calls), so it's off there. */
  showOrigin?: boolean;
}) {
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<RecordingMeta[]> => {
    try {
      const res = await fetch(`/api/portal/voice-agent/recordings?clientId=${clientId}`);
      const body = await res.json().catch(() => ({}));
      return res.ok && Array.isArray(body.recordings) ? body.recordings : [];
    } catch {
      return [];
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    load().then((list) => {
      if (!cancelled) setRecordings(list);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <section
      style={{
        marginTop: 18,
        border: `1px solid ${MUTED}44`,
        borderRadius: 14,
        background: "#fff",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 15, color: INK }}>Samtaleopptak</h3>
        <button
          onClick={() => void load().then(setRecordings)}
          style={{
            border: `1px solid ${MUTED}66`,
            background: "transparent",
            borderRadius: 8,
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
        Hver samtale med taleagenten tas opp og kan spilles av her.
      </p>

      {recordings === null ? (
        <p style={{ fontSize: 13, color: MUTED }}>Laster …</p>
      ) : recordings.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED }}>
          Ingen opptak ennå — de dukker opp her etter neste samtale.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {recordings.map((r) => (
            <li
              key={r.id}
              style={{
                border: `1px solid ${MUTED}33`,
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13.5, color: INK }}>
                  {fmtWhen(r.startedAt)}
                  {showOrigin && r.recordedBy === "client" && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        color: "#0d6b47",
                        background: "#15c07c22",
                        borderRadius: 6,
                        padding: "2px 7px",
                      }}
                    >
                      Kunde
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12.5, color: MUTED }}>
                  {fmtDuration(r.durationSeconds)} · {(r.sizeBytes / 1024).toFixed(0)} kB
                </span>
                {openId !== r.id && (
                  <button
                    onClick={() => setOpenId(r.id)}
                    style={{
                      border: `1px solid ${MUTED}66`,
                      background: "transparent",
                      borderRadius: 8,
                      padding: "4px 12px",
                      fontSize: 12.5,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: INK,
                    }}
                  >
                    Spill av
                  </button>
                )}
              </div>
              {openId === r.id && (
                // Mounted on demand so listing the panel never streams audio.
                <audio
                  controls
                  autoPlay
                  preload="none"
                  src={`/api/portal/voice-agent/recordings/${r.id}?clientId=${clientId}`}
                  style={{ width: "100%", marginTop: 10 }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

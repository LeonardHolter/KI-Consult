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
   *  from admin test calls, and show delete buttons. Off for the client —
   *  they can listen to their own calls but not remove review material. */
  showOrigin?: boolean;
}) {
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // id of the recording whose delete button is in its "Sikker?" stage.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(
        `/api/portal/voice-agent/recordings/${id}?clientId=${clientId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setRecordings((prev) => prev?.filter((r) => r.id !== id) ?? prev);
        if (openId === id) setOpenId(null);
      }
    } finally {
      setConfirmDeleteId(null);
    }
  };

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
                <span style={{ display: "inline-flex", gap: 6 }}>
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
                  {showOrigin &&
                    (confirmDeleteId === r.id ? (
                      <button
                        onClick={() => void handleDelete(r.id)}
                        onBlur={() => setConfirmDeleteId(null)}
                        style={{
                          border: "1px solid #c2562c",
                          background: "#c2562c",
                          borderRadius: 8,
                          padding: "4px 12px",
                          fontSize: 12.5,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          color: "#fff",
                          fontWeight: 700,
                        }}
                      >
                        Sikker?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        style={{
                          border: "1px solid #c2562c66",
                          background: "transparent",
                          borderRadius: 8,
                          padding: "4px 12px",
                          fontSize: 12.5,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          color: "#c2562c",
                        }}
                      >
                        Slett
                      </button>
                    ))}
                </span>
              </div>
              {openId === r.id && (
                // Mounted on demand so listing the panel never streams audio.
                // MediaRecorder's webm has no duration header, so the browser
                // reports Infinity and pins the scrubber at max; the huge-seek
                // trick forces it to compute the real duration, and the API
                // route's Range support makes the timeline seekable.
                <audio
                  controls
                  autoPlay
                  preload="none"
                  src={`/api/portal/voice-agent/recordings/${r.id}?clientId=${clientId}`}
                  style={{ width: "100%", marginTop: 10 }}
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    if (el.duration === Infinity) {
                      const back = () => {
                        el.removeEventListener("seeked", back);
                        el.currentTime = 0;
                      };
                      el.addEventListener("seeked", back);
                      el.currentTime = 1e10;
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

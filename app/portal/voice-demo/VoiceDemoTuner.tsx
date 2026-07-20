"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { diffLines, diffCounts } from "@/lib/voiceDemo/diff";
import { useVoiceDemoTest } from "@/lib/voiceDemo/useVoiceDemoTest";
import type { PromptSnapshot, TurnDetectionConfig, VoiceDemoSettings } from "@/lib/voiceDemo/types";

const VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"];
const MODELS = [
  "gpt-realtime",
  "gpt-realtime-2",
  "gpt-realtime-2.1",
  "gpt-realtime-2.1-mini",
  "gpt-realtime-1.5",
  "gpt-realtime-mini",
];
const TRANSCRIPTION_MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"];

type FullSettings = VoiceDemoSettings & { instructions: string };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("no-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VoiceDemoTuner({
  initialSettings,
  initialHistory,
  migrationApplied,
  clientId,
  clientName,
}: {
  initialSettings: FullSettings & { updatedAt: string | null };
  initialHistory: PromptSnapshot[];
  migrationApplied: boolean;
  /** Set only when tuning a client's dashboard agent rather than the marketing demo. */
  clientId?: string;
  clientName?: string;
}) {
  const [settings, setSettings] = useState<FullSettings>(initialSettings);
  const [savedInstructions, setSavedInstructions] = useState(initialSettings.instructions);
  const [history, setHistory] = useState(initialHistory);
  const [showDiff, setShowDiff] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const rt = useVoiceDemoTest();

  const set = <K extends keyof FullSettings>(key: K, value: FullSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const td = settings.turnDetection;
  const setTd = (next: TurnDetectionConfig) => set("turnDetection", next);

  const dirty = settings.instructions !== savedInstructions;

  const liveDiff = useMemo(
    () => (showDiff ? diffLines(savedInstructions, settings.instructions) : []),
    [showDiff, savedInstructions, settings.instructions],
  );
  const liveDiffCounts = useMemo(() => diffCounts(liveDiff), [liveDiff]);

  const historyDiff = useMemo(() => {
    if (!diffAgainst) return [];
    return diffLines(diffAgainst, settings.instructions);
  }, [diffAgainst, settings.instructions]);

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/portal/voice-demo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { ...settings, clientId } : settings),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Lagring feilet");
      if (dirty) {
        setHistory((prev) => [{ instructions: savedInstructions, savedAt: new Date().toISOString() }, ...prev].slice(0, 20));
      }
      setSavedInstructions(settings.instructions);
      setSaveMsg(clientId ? "Lagret — live på dashbordet nå." : "Lagret — live på nettsiden nå.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  function restore(snapshot: PromptSnapshot) {
    set("instructions", snapshot.instructions);
    setShowHistory(false);
    setDiffAgainst(null);
  }

  // Pass clientId so the test session registers the booking tools the client
  // prompt documents — without it the model narrates a calendar lookup it has
  // no way to perform.
  const testCall = () => rt.connect(settings, clientId);

  return (
    <div className="vdt">
      <style>{`
        .vdt { min-height: 100vh; background: #f3efe4; color: #16190f; font-family: var(--font-schibsted), system-ui, sans-serif; }
        .vdt-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 16px 24px; background: #fff; border-bottom: 1px solid rgba(154,154,140,.27); }
        .vdt-brand { font-weight: 800; font-size: 19px; letter-spacing: -.03em; }
        .vdt-brand span { color: #15A06A; }
        .vdt-back { padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #f3efe4; color: #16190f; text-decoration: none; font-size: 14px; font-weight: 600; }
        .vdt-back:hover { background: #efede2; }
        .vdt-main { padding: 26px 24px 60px; max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
        @media (max-width: 980px) { .vdt-main { grid-template-columns: 1fr; } }
        .vdt-title { font-size: 26px; letter-spacing: -.02em; margin: 0 0 4px; grid-column: 1 / -1; }
        .vdt-sub { color: #9a9a8c; font-size: 14px; margin: 0 0 8px; grid-column: 1 / -1; }
        .vdt-warn { grid-column: 1 / -1; background: #fff3e0; border: 1px solid #f0c88a; color: #7a4a00; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; margin-bottom: 4px; }
        .vdt-col { display: flex; flex-direction: column; gap: 16px; }
        .vdt-card { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 14px; padding: 20px; }
        .vdt-card h2 { margin: 0 0 14px; font-size: 1.02rem; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }
        .vdt-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .vdt-field { display: flex; flex-direction: column; gap: 5px; }
        .vdt-field.span2 { grid-column: 1 / -1; }
        .vdt-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9a8c; display: flex; align-items: center; justify-content: space-between; }
        .vdt-select, .vdt-input { width: 100%; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; padding: 8px 10px; font-size: 13.5px; color: #16190f; font-family: inherit; }
        .vdt-select:focus, .vdt-input:focus, .vdt-textarea:focus { outline: none; border-color: #15A06A; }
        .vdt-range { width: 100%; accent-color: #15A06A; }
        .vdt-toggle-row { display: flex; gap: 8px; }
        .vdt-toggle { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; color: #5c5f52; font-size: 12.5px; font-weight: 700; cursor: pointer; }
        .vdt-toggle.is-active { border-color: #15A06A; background: #e4f7ee; color: #0d6b47; }
        .vdt-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #3d4034; }
        .vdt-textarea { width: 100%; min-height: 320px; border-radius: 10px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; padding: 12px; font-size: 12.5px; line-height: 1.55; font-family: var(--font-space-mono), monospace; color: #16190f; resize: vertical; }
        .vdt-btn { padding: 9px 16px; border-radius: 9px; font-size: 13.5px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; }
        .vdt-btn.primary { background: #15c07c; color: #08231a; }
        .vdt-btn.primary:disabled { opacity: .5; cursor: default; }
        .vdt-btn.ghost { background: #f3efe4; color: #16190f; border: 1px solid rgba(154,154,140,.4); }
        .vdt-btn.stop { background: #C2562C; color: #fff; }
        .vdt-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .vdt-msg { font-size: 12.5px; color: #0d6b47; font-weight: 600; }
        .vdt-diff { font-family: var(--font-space-mono), monospace; font-size: 11.5px; line-height: 1.6; background: #16190f; border-radius: 10px; padding: 12px; max-height: 280px; overflow: auto; }
        .vdt-diff div { white-space: pre-wrap; word-break: break-word; padding: 0 4px; }
        .vdt-diff .same { color: #8a8b7c; }
        .vdt-diff .add { color: #7ee0ac; background: rgba(21,192,124,.12); }
        .vdt-diff .del { color: #e07e6a; background: rgba(194,86,44,.12); text-decoration: line-through; }
        .vdt-histitem { border: 1px solid rgba(154,154,140,.27); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
        .vdt-histitem time { font-size: 12px; color: #9a9a8c; flex: 1; }
        .vdt-histbtn { font-size: 11.5px; font-weight: 700; padding: 5px 9px; border-radius: 7px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; cursor: pointer; }
        .vdt-status { font-family: var(--font-space-mono), monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
        .vdt-status.idle { background: #efede2; color: #9a9a8c; }
        .vdt-status.connecting { background: #fff3e0; color: #a35a00; }
        .vdt-status.connected { background: #e4f7ee; color: #0d6b47; }
        .vdt-transcript { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; padding: 4px 2px; }
        .vdt-bubble { max-width: 88%; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; }
        .vdt-bubble.user { align-self: flex-end; background: #16190f; color: #f3efe4; }
        .vdt-bubble.assistant { align-self: flex-start; background: #efede2; color: #16190f; }
        .vdt-bubble.clipped { border: 1px solid #C2562C; }
        .vdt-clip-badge { display: inline-block; margin-top: 4px; font-size: 10.5px; font-weight: 700; color: #C2562C; }
        .vdt-empty { color: #9a9a8c; font-size: 13px; text-align: center; padding: 30px 0; }
        .vdt-eventlog { max-height: 260px; overflow-y: auto; font-family: var(--font-space-mono), monospace; font-size: 11px; background: #16190f; border-radius: 10px; padding: 10px; }
        .vdt-event { padding: 3px 6px; border-radius: 5px; color: #cfcdc0; }
        .vdt-event.notable { background: rgba(194,86,44,.18); color: #f0b39e; }
        .vdt-toggle-link { font-size: 12px; font-weight: 700; color: #0d6b47; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
      `}</style>

      <div className="vdt-bar">
        <span className="vdt-brand">
          KI&nbsp;Consult<span>.no</span>
        </span>
        <Link
          href={clientId ? `/portal?client=${clientId}` : "/portal"}
          className="vdt-back"
        >
          ‹ Dashboard
        </Link>
        <span style={{ marginLeft: "auto" }} />
        <form action={signOut}>
          <button className="vdt-back" style={{ fontFamily: "inherit", cursor: "pointer" }}>Logg ut</button>
        </form>
      </div>

      <div className="vdt-main">
        <h1 className="vdt-title">
          {clientId ? `${clientName} — agent-tuning` : "Realtime-demo — tuning"}
        </h1>
        <p className="vdt-sub">
          {clientId
            ? "Samme kontroller som i handzon-voice-lab. Lagrede endringer gjelder umiddelbart for «Snakk med agenten»-knappen på dashbordet."
            : "Samme kontroller som i handzon-voice-lab, koblet direkte til Oslo Tannlegesenter-demoen på forsiden. Lagrede endringer er live på nettsiden umiddelbart."}
        </p>

        {!migrationApplied && (
          <div className="vdt-warn">
            {clientId
              ? "Denne klienten har ikke egne agent-innstillinger ennå — du ser standardverdier. «Lagre» oppretter dem."
              : "Databasetabellen for disse innstillingene finnes ikke ennå — du ser standardverdier, og «Lagre» vil feile til migrasjonen er kjørt (supabase/004_voice_demo_settings.sql)."}
          </div>
        )}

        {/* LEFT: settings + prompt */}
        <div className="vdt-col">
          <div className="vdt-card">
            <h2>Innstillinger</h2>
            <div className="vdt-grid2">
              <div className="vdt-field span2">
                <label className="vdt-label">Modell</label>
                <select className="vdt-select" value={settings.model} onChange={(e) => set("model", e.target.value)}>
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>

              <div className="vdt-field">
                <label className="vdt-label">Stemme</label>
                <select className="vdt-select" value={settings.voice} onChange={(e) => set("voice", e.target.value)}>
                  {VOICES.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>

              <div className="vdt-field">
                <label className="vdt-label">
                  Hastighet <span>{settings.speed.toFixed(2)}×</span>
                </label>
                <input
                  type="range" min={0.25} max={1.5} step={0.05}
                  value={settings.speed}
                  onChange={(e) => set("speed", Number(e.target.value))}
                  className="vdt-range"
                />
              </div>

              <div className="vdt-field span2">
                <label className="vdt-label">Turdeteksjon (VAD)</label>
                <div className="vdt-toggle-row">
                  <button
                    type="button"
                    className={`vdt-toggle ${td.type === "semantic_vad" ? "is-active" : ""}`}
                    onClick={() => setTd({ type: "semantic_vad", eagerness: "medium", interrupt_response: td.interrupt_response })}
                  >
                    Semantic VAD
                  </button>
                  <button
                    type="button"
                    className={`vdt-toggle ${td.type === "server_vad" ? "is-active" : ""}`}
                    onClick={() => setTd({ type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, interrupt_response: td.interrupt_response })}
                  >
                    Server VAD
                  </button>
                </div>
              </div>

              {td.type === "semantic_vad" ? (
                <div className="vdt-field span2">
                  <label className="vdt-label">Eagerness</label>
                  <select
                    className="vdt-select"
                    value={td.eagerness}
                    onChange={(e) => setTd({ type: "semantic_vad", eagerness: e.target.value as never, interrupt_response: td.interrupt_response })}
                  >
                    <option value="low">low — tålmodig</option>
                    <option value="medium">medium — balansert</option>
                    <option value="high">high — svarer kjapt</option>
                    <option value="auto">auto</option>
                  </select>
                </div>
              ) : (
                <>
                  <div className="vdt-field">
                    <label className="vdt-label">Terskel <span>{td.threshold.toFixed(2)}</span></label>
                    <input type="range" min={0.1} max={0.9} step={0.05} value={td.threshold}
                      onChange={(e) => setTd({ ...td, threshold: Number(e.target.value) })} className="vdt-range" />
                  </div>
                  <div className="vdt-field">
                    <label className="vdt-label">Stillhet <span>{td.silence_duration_ms} ms</span></label>
                    <input type="range" min={200} max={1500} step={50} value={td.silence_duration_ms}
                      onChange={(e) => setTd({ ...td, silence_duration_ms: Number(e.target.value) })} className="vdt-range" />
                  </div>
                </>
              )}

              <div className="vdt-field span2">
                <label className="vdt-check">
                  <input
                    type="checkbox"
                    checked={td.interrupt_response}
                    onChange={(e) => setTd({ ...td, interrupt_response: e.target.checked })}
                  />
                  Kunden kan avbryte agenten (barge-in)
                </label>
              </div>

              <div className="vdt-field">
                <label className="vdt-label">Støyreduksjon</label>
                <select className="vdt-select" value={settings.noiseReduction} onChange={(e) => set("noiseReduction", e.target.value as FullSettings["noiseReduction"])}>
                  <option value="near_field">near_field (headset)</option>
                  <option value="far_field">far_field (høyttaler)</option>
                  <option value="off">av</option>
                </select>
              </div>

              <div className="vdt-field">
                <label className="vdt-label">Transkripsjon</label>
                <select className="vdt-select" value={settings.transcriptionModel} onChange={(e) => set("transcriptionModel", e.target.value)}>
                  {TRANSCRIPTION_MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="vdt-card">
            <h2>
              Prompt
              {dirty && <span style={{ fontSize: 11, color: "#a35a00", fontWeight: 700 }}>ulagrede endringer</span>}
            </h2>
            <textarea
              className="vdt-textarea"
              value={settings.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              spellCheck={false}
            />
            <div className="vdt-row" style={{ marginTop: 10 }}>
              <button type="button" className="vdt-btn primary" onClick={save} disabled={saving || !dirty}>
                {saving ? "Lagrer…" : "Lagre"}
              </button>
              {dirty && (
                <button type="button" className="vdt-btn ghost" onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? "Skjul endringer" : "Vis endringer"}
                </button>
              )}
              {history.length > 0 && (
                <button type="button" className="vdt-btn ghost" onClick={() => setShowHistory((v) => !v)}>
                  Tidligere versjoner ({history.length})
                </button>
              )}
              {saveMsg && <span className="vdt-msg">{saveMsg}</span>}
            </div>

            {showDiff && dirty && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#9a9a8c", marginBottom: 6 }}>
                  +{liveDiffCounts.added} −{liveDiffCounts.removed} mot sist lagret
                </div>
                <div className="vdt-diff">
                  {liveDiff.map((l, i) => (
                    <div key={i} className={l.type}>
                      {l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
                      {l.text || " "}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showHistory && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((snap, i) => (
                  <div key={i} className="vdt-histitem">
                    <time>{fmtTime(snap.savedAt)}</time>
                    <button
                      type="button"
                      className="vdt-histbtn"
                      onClick={() => setDiffAgainst(diffAgainst === snap.instructions ? null : snap.instructions)}
                    >
                      {diffAgainst === snap.instructions ? "Skjul diff" : "Vis diff"}
                    </button>
                    <button type="button" className="vdt-histbtn" onClick={() => restore(snap)}>
                      Gjenopprett
                    </button>
                  </div>
                ))}
              </div>
            )}

            {diffAgainst && (
              <div className="vdt-diff" style={{ marginTop: 10 }}>
                {historyDiff.map((l, i) => (
                  <div key={i} className={l.type}>
                    {l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
                    {l.text || " "}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: live test call */}
        <div className="vdt-col">
          <div className="vdt-card">
            <h2>
              Test samtale
              <span className={`vdt-status ${rt.status}`}>
                {rt.status === "connected" ? (rt.agentState === "speaking" ? "snakker" : "lytter") : rt.status === "connecting" ? "kobler til" : "frakoblet"}
              </span>
            </h2>
            <p style={{ fontSize: 13, color: "#5c5f52", margin: "0 0 12px" }}>
              Tester nåværende (ulagrede) innstillinger og prompt direkte — akkurat som i lab-en.
              Lagre først for at endringene skal gjelde på den offentlige nettsiden.
            </p>
            <div className="vdt-row" style={{ marginBottom: 14 }}>
              {rt.status === "disconnected" ? (
                <button type="button" className="vdt-btn primary" onClick={testCall}>
                  Start testsamtale →
                </button>
              ) : (
                <button type="button" className="vdt-btn stop" onClick={rt.disconnect}>
                  Avslutt
                </button>
              )}
              {rt.error && <span style={{ color: "#C2562C", fontSize: 12.5 }}>{rt.error}</span>}
            </div>

            {rt.transcript.length === 0 ? (
              <div className="vdt-empty">Ingen samtale ennå. Start en testsamtale og snakk i mikrofonen.</div>
            ) : (
              <div className="vdt-transcript">
                {rt.transcript.map((t) =>
                  t.kind === "user" || t.kind === "assistant" ? (
                    <div key={t.id} className={`vdt-bubble ${t.kind} ${t.kind === "assistant" && t.clipped ? "clipped" : ""}`}>
                      {t.text}
                      {t.kind === "assistant" && t.clipped && <div className="vdt-clip-badge">✂ klippet</div>}
                    </div>
                  ) : null,
                )}
              </div>
            )}

            <div className="vdt-row" style={{ marginTop: 12 }}>
              <button type="button" className="vdt-toggle-link" onClick={() => setShowEvents((v) => !v)}>
                {showEvents ? "Skjul hendelseslogg" : `Vis hendelseslogg (${rt.events.length})`}
              </button>
            </div>
            {showEvents && (
              <div className="vdt-eventlog" style={{ marginTop: 8 }}>
                {rt.events.length === 0 ? (
                  <div style={{ color: "#8a8b7c" }}>Ingen hendelser ennå.</div>
                ) : (
                  rt.events.map((e, i) => {
                    const notable =
                      e.type === "response.done" ||
                      e.type.startsWith("output_audio_buffer.cleared") ||
                      e.type.startsWith("input_audio_buffer.speech_started") ||
                      e.type.startsWith("connection.");
                    // response.done is where silent-agent bugs hide: the type
                    // alone can't tell an ordinary reply from a turn that
                    // produced nothing. Show status + output count so the log
                    // is diagnosable without opening devtools.
                    let detail = "";
                    if (e.type === "response.done") {
                      const resp = (e.payload as { response?: { status?: string; output?: unknown[] } })
                        ?.response;
                      const n = resp?.output?.length ?? 0;
                      detail = ` — ${resp?.status ?? "?"}, ${n} output${n === 1 ? "" : "s"}`;
                    }
                    const empty = detail.includes(", 0 output");
                    return (
                      <div
                        key={i}
                        className={`vdt-event ${notable ? "notable" : ""}`}
                        style={empty ? { color: "#c2562c", fontWeight: 700 } : undefined}
                      >
                        {e.dir === "in" ? "←" : "→"} {e.type}
                        {detail}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

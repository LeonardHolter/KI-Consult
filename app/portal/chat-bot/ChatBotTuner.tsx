"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { diffLines, diffCounts } from "@/lib/voiceDemo/diff";
import type { ChatBotSettings, PromptSnapshot } from "@/lib/chatBot/types";

type FullSettings = ChatBotSettings & { updatedAt: string | null };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("no-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Instructions + knowledge base are versioned together (one admin edit
// session = one snapshot), so diffing/restoring treats them as one blob
// with a separator, rather than two independent diff views.
const SEP = "\n\n---KUNNSKAPSBASE---\n\n";
const toBlob = (s: { instructions: string; knowledgeBase: string }) => s.instructions + SEP + s.knowledgeBase;
const fromBlob = (blob: string): { instructions: string; knowledgeBase: string } => {
  const i = blob.indexOf(SEP);
  return i === -1
    ? { instructions: blob, knowledgeBase: "" }
    : { instructions: blob.slice(0, i), knowledgeBase: blob.slice(i + SEP.length) };
};

export default function ChatBotTuner({
  clientId,
  clientName,
  initialSettings,
  initialHistory,
  configured,
}: {
  clientId: string;
  clientName: string;
  initialSettings: FullSettings;
  initialHistory: PromptSnapshot[];
  configured: boolean;
}) {
  const [settings, setSettings] = useState<FullSettings>(initialSettings);
  const [savedBlob, setSavedBlob] = useState(toBlob(initialSettings));
  const [history, setHistory] = useState(initialHistory);
  const [showDiff, setShowDiff] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [diffAgainst, setDiffAgainst] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const set = <K extends keyof FullSettings>(key: K, value: FullSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const currentBlob = toBlob(settings);
  const dirty = currentBlob !== savedBlob;

  const liveDiff = useMemo(
    () => (showDiff ? diffLines(savedBlob, currentBlob) : []),
    [showDiff, savedBlob, currentBlob],
  );
  const liveDiffCounts = useMemo(() => diffCounts(liveDiff), [liveDiff]);

  const historyDiff = useMemo(() => {
    if (!diffAgainst) return [];
    return diffLines(diffAgainst, currentBlob);
  }, [diffAgainst, currentBlob]);

  const embedSnippet = `<script src="https://www.kiconsult.no/embed.js?client=${clientId}" async></script>`;

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/portal/chat-bot/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, clientId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Lagring feilet");
      if (dirty) {
        const prev = fromBlob(savedBlob);
        setHistory((h) =>
          [
            { instructions: prev.instructions, knowledgeBase: prev.knowledgeBase, savedAt: new Date().toISOString() },
            ...h,
          ].slice(0, 20),
        );
      }
      setSavedBlob(currentBlob);
      setSaveMsg("Lagret — live på nettsiden nå.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  function restore(snapshot: PromptSnapshot) {
    setSettings((s) => ({ ...s, instructions: snapshot.instructions, knowledgeBase: snapshot.knowledgeBase }));
    setShowHistory(false);
    setDiffAgainst(null);
  }

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setSaveMsg("Kopiert til utklippstavlen.");
      setTimeout(() => setSaveMsg(null), 2500);
    } catch {
      /* clipboard unavailable — snippet is still visible to select manually */
    }
  }

  return (
    <div className="cbt">
      <style>{`
        .cbt { min-height: 100vh; background: #f3efe4; color: #16190f; font-family: var(--font-schibsted), system-ui, sans-serif; }
        .cbt-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 16px 24px; background: #fff; border-bottom: 1px solid rgba(154,154,140,.27); }
        .cbt-brand { font-weight: 800; font-size: 19px; letter-spacing: -.03em; }
        .cbt-brand span { color: #15A06A; }
        .cbt-back { padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #f3efe4; color: #16190f; text-decoration: none; font-size: 14px; font-weight: 600; }
        .cbt-back:hover { background: #efede2; }
        .cbt-main { padding: 26px 24px 60px; max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
        @media (max-width: 980px) { .cbt-main { grid-template-columns: 1fr; } }
        .cbt-title { font-size: 26px; letter-spacing: -.02em; margin: 0 0 4px; grid-column: 1 / -1; }
        .cbt-sub { color: #9a9a8c; font-size: 14px; margin: 0 0 8px; grid-column: 1 / -1; }
        .cbt-warn { grid-column: 1 / -1; background: #fff3e0; border: 1px solid #f0c88a; color: #7a4a00; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; margin-bottom: 4px; }
        .cbt-col { display: flex; flex-direction: column; gap: 16px; }
        .cbt-card { background: #fff; border: 1px solid rgba(154,154,140,.27); border-radius: 14px; padding: 20px; }
        .cbt-card h2 { margin: 0 0 14px; font-size: 1.02rem; letter-spacing: -.01em; display: flex; align-items: center; gap: 8px; }
        .cbt-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cbt-field { display: flex; flex-direction: column; gap: 5px; }
        .cbt-field.span2 { grid-column: 1 / -1; }
        .cbt-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9a8c; }
        .cbt-input, .cbt-select { width: 100%; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; padding: 8px 10px; font-size: 13.5px; color: #16190f; font-family: inherit; }
        .cbt-input:focus, .cbt-textarea:focus { outline: none; border-color: #15A06A; }
        .cbt-color-row { display: flex; align-items: center; gap: 8px; }
        .cbt-color-swatch { width: 34px; height: 34px; border-radius: 8px; border: 1px solid rgba(154,154,140,.4); padding: 0; cursor: pointer; }
        .cbt-textarea { width: 100%; min-height: 220px; border-radius: 10px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; padding: 12px; font-size: 12.5px; line-height: 1.55; font-family: var(--font-space-mono), monospace; color: #16190f; resize: vertical; }
        .cbt-btn { padding: 9px 16px; border-radius: 9px; font-size: 13.5px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; }
        .cbt-btn.primary { background: #15c07c; color: #08231a; }
        .cbt-btn.primary:disabled { opacity: .5; cursor: default; }
        .cbt-btn.ghost { background: #f3efe4; color: #16190f; border: 1px solid rgba(154,154,140,.4); }
        .cbt-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .cbt-msg { font-size: 12.5px; color: #0d6b47; font-weight: 600; }
        .cbt-diff { font-family: var(--font-space-mono), monospace; font-size: 11.5px; line-height: 1.6; background: #16190f; border-radius: 10px; padding: 12px; max-height: 280px; overflow: auto; }
        .cbt-diff div { white-space: pre-wrap; word-break: break-word; padding: 0 4px; }
        .cbt-diff .same { color: #8a8b7c; }
        .cbt-diff .add { color: #7ee0ac; background: rgba(21,192,124,.12); }
        .cbt-diff .del { color: #e07e6a; background: rgba(194,86,44,.12); text-decoration: line-through; }
        .cbt-histitem { border: 1px solid rgba(154,154,140,.27); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
        .cbt-histitem time { font-size: 12px; color: #9a9a8c; flex: 1; }
        .cbt-histbtn { font-size: 11.5px; font-weight: 700; padding: 5px 9px; border-radius: 7px; border: 1px solid rgba(154,154,140,.4); background: #faf8f1; cursor: pointer; }
        .cbt-code { font-family: var(--font-space-mono), monospace; font-size: 12px; background: #16190f; color: #cfe8db; border-radius: 10px; padding: 12px; word-break: break-all; }
        .cbt-preview { border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 10px; }
      `}</style>

      <div className="cbt-bar">
        <span className="cbt-brand">
          KI&nbsp;Consult<span>.no</span>
        </span>
        <Link href={`/portal?client=${clientId}`} className="cbt-back">‹ Dashboard</Link>
        <span style={{ marginLeft: "auto" }} />
        <form action={signOut}>
          <button className="cbt-back" style={{ fontFamily: "inherit", cursor: "pointer" }}>Logg ut</button>
        </form>
      </div>

      <div className="cbt-main">
        <h1 className="cbt-title">{clientName} — chatbot</h1>
        <p className="cbt-sub">
          Branding, prompt og kunnskapsbase for tekst-chatboten. Lagrede endringer gjelder umiddelbart
          for alle som bruker embed-koden under.
        </p>

        {!configured && (
          <div className="cbt-warn">
            Denne klienten har ikke egne chatbot-innstillinger ennå — du ser standardverdier. «Lagre»
            oppretter dem.
          </div>
        )}

        <div className="cbt-col">
          <div className="cbt-card">
            <h2>Branding</h2>
            <div className="cbt-grid2">
              <div className="cbt-field">
                <label className="cbt-label">Bot-navn</label>
                <input className="cbt-input" value={settings.botName} onChange={(e) => set("botName", e.target.value)} />
              </div>
              <div className="cbt-field">
                <label className="cbt-label">Firmanavn (vises i widget-header)</label>
                <input className="cbt-input" value={settings.companyName} onChange={(e) => set("companyName", e.target.value)} />
              </div>

              <div className="cbt-field span2">
                <label className="cbt-label">Velkomstmelding</label>
                <input className="cbt-input" value={settings.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} />
              </div>

              <div className="cbt-field">
                <label className="cbt-label">Hovedfarge</label>
                <div className="cbt-color-row">
                  <input type="color" className="cbt-color-swatch" value={settings.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
                  <input className="cbt-input" value={settings.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} />
                </div>
              </div>
              <div className="cbt-field">
                <label className="cbt-label">Aksentfarge (hover)</label>
                <div className="cbt-color-row">
                  <input type="color" className="cbt-color-swatch" value={settings.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
                  <input className="cbt-input" value={settings.accentColor} onChange={(e) => set("accentColor", e.target.value)} />
                </div>
              </div>

              <div className="cbt-field span2">
                <label className="cbt-label">Logo-URL (valgfritt)</label>
                <input
                  className="cbt-input"
                  placeholder="https://…/logo.webp"
                  value={settings.logoUrl ?? ""}
                  onChange={(e) => set("logoUrl", e.target.value || null)}
                />
              </div>

              <div className="cbt-field span2">
                <label className="cbt-label">Tillatte domener (CORS) — ett per linje</label>
                <textarea
                  className="cbt-textarea"
                  style={{ minHeight: 70, fontFamily: "inherit", fontSize: 13.5 }}
                  value={settings.allowedOrigins.join("\n")}
                  onChange={(e) => set("allowedOrigins", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                  placeholder={"https://kundens-domene.no\nhttps://www.kundens-domene.no"}
                />
              </div>
            </div>

            <div
              className="cbt-preview"
              style={{ background: settings.primaryColor, marginTop: 14 }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 7, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {settings.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.logoUrl} alt="" style={{ width: 26, height: "auto" }} />
                ) : null}
              </span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Kundeservice</div>
                <div style={{ color: "#fff", opacity: 0.85, fontSize: 11.5 }}>{settings.companyName || settings.botName}</div>
              </div>
            </div>
          </div>

          <div className="cbt-card">
            <h2>Embed-kode</h2>
            <p style={{ fontSize: 13, color: "#5c5f52", margin: "0 0 10px" }}>
              Send denne til {clientName}s webutvikler — én linje, limes inn hvor som helst i HTML-en.
            </p>
            <div className="cbt-code">{embedSnippet}</div>
            <div className="cbt-row" style={{ marginTop: 10 }}>
              <button type="button" className="cbt-btn ghost" onClick={copyEmbed}>Kopier</button>
            </div>
          </div>
        </div>

        <div className="cbt-col">
          <div className="cbt-card">
            <h2>
              Prompt (instructions)
              {dirty && <span style={{ fontSize: 11, color: "#a35a00", fontWeight: 700 }}>ulagrede endringer</span>}
            </h2>
            <textarea
              className="cbt-textarea"
              value={settings.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="cbt-card">
            <h2>Kunnskapsbase</h2>
            <textarea
              className="cbt-textarea"
              value={settings.knowledgeBase}
              onChange={(e) => set("knowledgeBase", e.target.value)}
              spellCheck={false}
              placeholder="Priser, tjenester, åpningstider — alt agenten skal kunne referere til."
            />

            <div className="cbt-row" style={{ marginTop: 10 }}>
              <button type="button" className="cbt-btn primary" onClick={save} disabled={saving || !dirty}>
                {saving ? "Lagrer…" : "Lagre"}
              </button>
              {dirty && (
                <button type="button" className="cbt-btn ghost" onClick={() => setShowDiff((v) => !v)}>
                  {showDiff ? "Skjul endringer" : "Vis endringer"}
                </button>
              )}
              {history.length > 0 && (
                <button type="button" className="cbt-btn ghost" onClick={() => setShowHistory((v) => !v)}>
                  Tidligere versjoner ({history.length})
                </button>
              )}
              {saveMsg && <span className="cbt-msg">{saveMsg}</span>}
            </div>

            {showDiff && dirty && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#9a9a8c", marginBottom: 6 }}>
                  +{liveDiffCounts.added} −{liveDiffCounts.removed} mot sist lagret (prompt + kunnskapsbase)
                </div>
                <div className="cbt-diff">
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
                {history.map((snap, i) => {
                  const blob = toBlob(snap);
                  return (
                    <div key={i} className="cbt-histitem">
                      <time>{fmtTime(snap.savedAt)}</time>
                      <button
                        type="button"
                        className="cbt-histbtn"
                        onClick={() => setDiffAgainst(diffAgainst === blob ? null : blob)}
                      >
                        {diffAgainst === blob ? "Skjul diff" : "Vis diff"}
                      </button>
                      <button type="button" className="cbt-histbtn" onClick={() => restore(snap)}>
                        Gjenopprett
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {diffAgainst && (
              <div className="cbt-diff" style={{ marginTop: 10 }}>
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
      </div>
    </div>
  );
}

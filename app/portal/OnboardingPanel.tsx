"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Admin onboarding panel: create a new client, see the integration
// checklist for any client, and create the client's portal login. Purely
// additive to AdminOverview — it talks only to /api/portal/onboarding and
// links out to the existing per-client surfaces (tuners, dashboard).

const INK = "#16190f";
const MUTED = "#9a9a8c";
const GREEN = "#15c07c";

type ClientRow = { id: string; slug: string; name: string };

type Status = {
  chatSeeded: boolean;
  chatCustomized: boolean;
  voiceSeeded: boolean;
  voiceCustomized: boolean;
  calendarConnected: boolean;
  voiceBookingMode: "sandbox" | "live";
  userCount: number;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${MUTED}66`,
  fontFamily: "inherit",
  fontSize: 14,
  minWidth: 220,
};

const btnStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: GREEN,
  color: "#08231a",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};

function ChecklistItem({
  done,
  label,
  detail,
  href,
  linkText,
}: {
  done: boolean;
  label: string;
  detail?: string;
  href?: string;
  linkText?: string;
}) {
  return (
    <li style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 0", borderBottom: `1px solid ${MUTED}22` }}>
      <span style={{ fontSize: 15, color: done ? "#0d6b47" : "#a35a00", fontWeight: 800, flexShrink: 0 }}>
        {done ? "✓" : "○"}
      </span>
      <span style={{ fontSize: 14, color: INK, fontWeight: 600 }}>{label}</span>
      {detail && <span style={{ fontSize: 12.5, color: MUTED }}>{detail}</span>}
      {href && (
        <Link href={href} style={{ marginLeft: "auto", fontSize: 13, color: "#0d6b47", fontWeight: 700, whiteSpace: "nowrap" }}>
          {linkText ?? "Åpne"} →
        </Link>
      )}
    </li>
  );
}

export default function OnboardingPanel({ clients }: { clients: ClientRow[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which client the checklist shows — a fresh creation lands here too.
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedName, setSelectedName] = useState<string>("");
  const [status, setStatus] = useState<Status | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const loadStatus = useCallback(async (clientId: string): Promise<Status | null> => {
    try {
      const res = await fetch(`/api/portal/onboarding?clientId=${clientId}`);
      const body = await res.json().catch(() => ({}));
      return res.ok && body.status ? body.status : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    loadStatus(selectedId).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadStatus]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name, slug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Noe gikk galt.");
      setStatus(null);
      setSelectedId(body.client.id);
      setSelectedName(body.client.name);
      setName("");
      setSlug("");
      setSlugTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite() {
    if (!selectedId) return;
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          clientId: selectedId,
          email: inviteEmail,
          fullName: inviteName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Noe gikk galt.");
      setCredentials({ email: body.email, password: body.password });
      setInviteEmail("");
      setInviteName("");
      void loadStatus(selectedId).then(setStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noe gikk galt.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${MUTED}33`,
        borderRadius: 12,
        padding: "18px 22px",
        marginBottom: 24,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 16,
          fontWeight: 800,
          color: INK,
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#0d6b47" }}>{open ? "▾" : "▸"}</span> Onboarding — ny kunde
      </button>

      {open && (
        <div style={{ marginTop: 16 }}>
          {/* Create */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              placeholder="Bedriftsnavn (f.eks. Handz On Strømmen)"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 260 }}
            />
            <input
              placeholder="slug (f.eks. handzon-strommen)"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              style={inputStyle}
            />
            <button onClick={() => void handleCreate()} disabled={creating || !name || !slug} style={{ ...btnStyle, opacity: creating || !name || !slug ? 0.5 : 1 }}>
              {creating ? "Oppretter…" : "Opprett kunde"}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: MUTED, margin: "8px 0 0" }}>
            Oppretter kunden og legger inn ferdigstrukturerte start-prompter for både chat-bot og
            tale-agent (med [FYLL INN]-markører). Ingenting eksisterende røres.
          </p>

          {/* Or pick an existing client to see its checklist */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <span style={{ fontSize: 13, color: MUTED }}>…eller vis sjekkliste for:</span>
            <select
              value={selectedId}
              onChange={(e) => {
                setStatus(null);
                setSelectedId(e.target.value);
                setSelectedName(clients.find((c) => c.id === e.target.value)?.name ?? "");
                setCredentials(null);
              }}
              style={{ ...inputStyle, minWidth: 200 }}
            >
              <option value="">Velg kunde…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p style={{ color: "#c2562c", fontSize: 13.5, fontWeight: 600, margin: "12px 0 0" }}>{error}</p>
          )}

          {/* Checklist */}
          {selectedId && (
            <div style={{ marginTop: 18, borderTop: `2px solid ${INK}`, paddingTop: 12 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>
                Sjekkliste: {selectedName || "valgt kunde"}
              </h3>
              {!status ? (
                <p style={{ fontSize: 13, color: MUTED }}>Laster status…</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  <ChecklistItem
                    done={status.chatCustomized}
                    label="Chat-bot: prompt og kunnskapsbase"
                    detail={
                      status.chatCustomized
                        ? "tilpasset"
                        : status.chatSeeded
                          ? "startmal lagt inn — fyll ut [FYLL INN]-feltene"
                          : "mangler"
                    }
                    href={`/portal/chat-bot?client=${selectedId}`}
                    linkText="Chat-tuner"
                  />
                  <ChecklistItem
                    done={status.voiceCustomized}
                    label="Tale-agent: prompt og stemme"
                    detail={
                      status.voiceCustomized
                        ? "tilpasset"
                        : status.voiceSeeded
                          ? "startmal lagt inn — fyll ut og test med egne ører"
                          : "mangler"
                    }
                    href={`/portal/voice-demo?client=${selectedId}`}
                    linkText="Tale-tuner"
                  />
                  <ChecklistItem
                    done={status.calendarConnected}
                    label="Google Calendar"
                    detail={
                      status.calendarConnected
                        ? "koblet til"
                        : "ikke koblet — bookinger går til demo-lageret inntil videre"
                    }
                    href={`/portal?client=${selectedId}`}
                    linkText="Dashbord"
                  />
                  <ChecklistItem
                    done={status.voiceBookingMode === "live"}
                    label="Talebooking-modus"
                    detail={
                      status.voiceBookingMode === "live"
                        ? "EKTE kalender"
                        : "sandkasse (riktig under testing — flip til ekte når kunden er klar)"
                    }
                    href={`/portal?client=${selectedId}`}
                    linkText="Dashbord"
                  />
                  <ChecklistItem
                    done={status.userCount > 0}
                    label="Kundens innlogging"
                    detail={status.userCount > 0 ? `${status.userCount} bruker(e)` : "ingen brukere ennå"}
                  />
                </ul>
              )}

              {/* Embed snippet */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>
                  Chat-widget på kundens nettside:
                </div>
                <code
                  style={{
                    display: "block",
                    background: "#f3efe4",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontSize: 12,
                    overflowX: "auto",
                    whiteSpace: "nowrap",
                  }}
                >
                  {`<script src="https://www.kiconsult.no/embed.js?client=${selectedId}" defer></script>`}
                </code>
                <p style={{ fontSize: 12, color: MUTED, margin: "6px 0 0" }}>
                  Husk å legge kundens domene i allowed_origins i chat-tuneren.
                </p>
              </div>

              {/* Invite user */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 }}>
                  Opprett innlogging for kunden:
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <input
                    placeholder="e-post"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="fullt navn (valgfritt)"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    style={inputStyle}
                  />
                  <button
                    onClick={() => void handleInvite()}
                    disabled={inviting || !inviteEmail}
                    style={{ ...btnStyle, opacity: inviting || !inviteEmail ? 0.5 : 1 }}
                  >
                    {inviting ? "Oppretter…" : "Opprett bruker"}
                  </button>
                </div>
                {credentials && (
                  <div
                    style={{
                      marginTop: 10,
                      background: "#0B2118",
                      color: "#D8E4DC",
                      borderRadius: 8,
                      padding: "12px 14px",
                      fontSize: 13.5,
                    }}
                  >
                    Bruker opprettet — send disse til kunden (passordet vises kun nå):
                    <div style={{ fontFamily: "monospace", marginTop: 6 }}>
                      {credentials.email} / {credentials.password}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

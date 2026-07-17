"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { login } from "./actions";

const CREAM = "#f3efe4";
const INK = "#16190f";
const GREEN = "#15c07c";
const MUTED = "#9a9a8c";
const DARK = "#08231a";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/portal";
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form
      action={action}
      style={{
        width: "100%",
        maxWidth: 380,
        background: "#fff",
        border: `1px solid ${MUTED}33`,
        borderRadius: 14,
        padding: 32,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: "-0.03em" }}>
        KI&nbsp;Consult<span style={{ color: "#15A06A" }}>.no</span>
      </div>
      <h1 style={{ fontSize: 24, margin: "18px 0 6px", letterSpacing: "-0.02em" }}>
        Logg inn
      </h1>
      <p style={{ color: MUTED, fontSize: 14, margin: "0 0 22px" }}>
        Se samtalene til chatboten din.
      </p>

      <input type="hidden" name="next" value={next} />

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        E-post
      </label>
      <input
        name="email"
        type="email"
        autoComplete="email"
        required
        style={{
          width: "100%", padding: "11px 13px", fontSize: 15, marginBottom: 16,
          border: `1px solid ${MUTED}66`, borderRadius: 9, background: CREAM,
          color: INK, fontFamily: "inherit",
        }}
      />

      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        Passord
      </label>
      <input
        name="password"
        type="password"
        autoComplete="current-password"
        required
        style={{
          width: "100%", padding: "11px 13px", fontSize: 15, marginBottom: 20,
          border: `1px solid ${MUTED}66`, borderRadius: 9, background: CREAM,
          color: INK, fontFamily: "inherit",
        }}
      />

      {state?.error && (
        <p
          role="alert"
          style={{
            background: "#fdecec", color: "#8a1f1f", fontSize: 13.5,
            padding: "9px 12px", borderRadius: 8, margin: "0 0 16px",
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
        style={{
          width: "100%", padding: "12px 16px", fontSize: 15, fontWeight: 700,
          border: 0, borderRadius: 9, color: DARK,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1, fontFamily: "inherit",
        }}
      >
        {pending ? "Logger inn…" : "Logg inn"}
      </button>

      <p style={{ color: MUTED, fontSize: 12.5, margin: "18px 0 0", lineHeight: 1.5 }}>
        Har du ikke tilgang? Ta kontakt med KI Consult, så oppretter vi en bruker
        til deg.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24, background: CREAM, color: INK,
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

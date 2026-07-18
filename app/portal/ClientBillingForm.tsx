"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/portal/data";

const STATUSES: Client["status"][] = ["trial", "active", "paused", "churned"];

export default function ClientBillingForm({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(client.plan ?? "");
  const [price, setPrice] = useState(client.monthly_price_nok?.toString() ?? "");
  const [status, setStatus] = useState<Client["status"]>(client.status);
  const [email, setEmail] = useState(client.contact_email ?? "");
  const [phone, setPhone] = useState(client.contact_phone ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: plan || null,
          monthlyPriceNok: price || null,
          status,
          contactEmail: email || null,
          contactPhone: phone || null,
        }),
      });
      router.refresh();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="cbf-toggle">
        Rediger
        <style>{`.cbf-toggle { font-size: 12px; font-weight: 700; color: #0d6b47; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }`}</style>
      </button>
    );
  }

  return (
    <div className="cbf">
      <style>{`
        .cbf { display: flex; flex-direction: column; gap: 8px; background: #faf8f1; border: 1px solid rgba(154,154,140,.3); border-radius: 10px; padding: 12px; width: 100%; max-width: 420px; }
        .cbf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .cbf label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9a8c; display: block; margin-bottom: 3px; }
        .cbf input, .cbf select { width: 100%; border-radius: 7px; border: 1px solid rgba(154,154,140,.4); background: #fff; padding: 6px 8px; font-size: 13px; font-family: inherit; }
        .cbf-actions { display: flex; gap: 8px; margin-top: 2px; }
        .cbf-btn { padding: 6px 12px; border-radius: 7px; font-size: 12.5px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; }
        .cbf-btn.primary { background: #15c07c; color: #08231a; }
        .cbf-btn.ghost { background: #efede2; color: #16190f; }
      `}</style>
      <div className="cbf-row">
        <div>
          <label>Plan</label>
          <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="f.eks. Standard" />
        </div>
        <div>
          <label>Pris/mnd (NOK)</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="2990" />
        </div>
      </div>
      <div className="cbf-row">
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Client["status"])}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Kontakt-e-post</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sa@handzon.no" />
        </div>
      </div>
      <div>
        <label>Kontakt-telefon</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+47 91 78 78 01" />
      </div>
      <div className="cbf-actions">
        <button type="button" className="cbf-btn primary" onClick={save} disabled={saving}>
          {saving ? "Lagrer…" : "Lagre"}
        </button>
        <button type="button" className="cbf-btn ghost" onClick={() => setOpen(false)}>
          Avbryt
        </button>
      </div>
    </div>
  );
}

"use client";

import GoogleCalendarConnect from "./GoogleCalendarConnect";

// Thin modal wrapper — the actual connect flow lives in
// GoogleCalendarConnect, shared with /portal/integrasjoner.

export default function CalendarConnectModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  return (
    <div className="ccm-backdrop" onClick={onClose}>
      <style>{`
        .ccm-backdrop { position: fixed; inset: 0; background: rgba(22,25,15,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
        .ccm { background: #fff; border-radius: 14px; padding: 28px; width: 100%; max-width: 480px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,.25); position: relative; }
        .ccm-close { position: absolute; top: 14px; right: 14px; border: 0; background: #f3efe4; color: #16190f; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 15px; line-height: 1; }
        .ccm h2 { margin: 0 0 18px; font-size: 1.2rem; letter-spacing: -.02em; display: flex; align-items: center; gap: 8px; }
      `}</style>
      <div className="ccm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Google Calendar-integrasjon">
        <button className="ccm-close" aria-label="Lukk" onClick={onClose}>✕</button>
        <h2>📅 Google Calendar-integrasjon</h2>
        <GoogleCalendarConnect clientId={clientId} />
      </div>
    </div>
  );
}

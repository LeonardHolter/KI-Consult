"use client";

import { useState } from "react";

export default function BookingForm() {
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);

  const handleCompanyChange = (value: string) => {
    setCompany(value);
    if (value.trim()) setShowTimeInput(true);
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (value.trim()) setShowTimeInput(true);
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setHours(now.getHours() + 12);
    return now.toISOString().slice(0, 16);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!company.trim() || !phone.trim() || !dateTime) {
      setError("Vennligst fyll ut alle feltene.");
      return;
    }

    const selectedTime = new Date(dateTime);
    const minTime = new Date();
    minTime.setHours(minTime.getHours() + 12);

    if (selectedTime < minTime) {
      setError("Velg et tidspunkt minst 12 timer fra nå.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/send-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          phone,
          dateTime: selectedTime.toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Noe gikk galt.");
      }

      setSuccess(true);
      setCompany("");
      setPhone("");
      setDateTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#3A3D31" }}>Bedrift</label>
      <input
        type="text"
        placeholder="Bedriftsnavn"
        value={company}
        onChange={(e) => handleCompanyChange(e.target.value)}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 11,
          border: "1px solid #E2DCCB",
          background: "#FFFFFF",
          fontSize: 15,
          fontFamily: "inherit",
          margin: "6px 0 14px",
        }}
      />
      <label style={{ fontSize: 13, fontWeight: 600, color: "#3A3D31" }}>Telefon</label>
      <input
        type="tel"
        placeholder="+47 000 00 000"
        value={phone}
        onChange={(e) => handlePhoneChange(e.target.value)}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 11,
          border: "1px solid #E2DCCB",
          background: "#FFFFFF",
          fontSize: 15,
          fontFamily: "inherit",
          margin: "6px 0 14px",
        }}
      />
      {showTimeInput && (
        <>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#3A3D31" }}>Tidspunkt for demo</label>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            min={getMinDateTime()}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 11,
              border: "1px solid #E2DCCB",
              background: "#FFFFFF",
              fontSize: 15,
              fontFamily: "inherit",
              margin: "6px 0 18px",
            }}
          />
        </>
      )}
      {error && <div style={{ fontSize: 13, color: "#C2562C", marginBottom: 12 }}>{error}</div>}
      {success && (
        <div style={{ fontSize: 13, color: "#15A06A", marginBottom: 12 }}>
          Takk! Vi kontakter deg så fort som mulig.
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary"
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          color: "#08231A",
          fontWeight: 700,
          fontSize: 16,
          padding: 16,
          borderRadius: 12,
          textDecoration: "none",
          border: "none",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Sender..." : "Book demoen min →"}
      </button>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          marginTop: 16,
          fontSize: 13,
          color: "#5C5F52",
        }}
      >
        <span style={{ color: "#15A06A" }}>✓</span>GDPR <span style={{ color: "#15A06A" }}>✓</span>
        Hostet i Norge <span style={{ color: "#15A06A" }}>✓</span>BankID{" "}
        <span style={{ color: "#15A06A" }}>✓</span>Ingen lock-in
      </div>
    </form>
  );
}

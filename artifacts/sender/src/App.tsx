import { useState } from "react";

export default function App() {
  const [channelId, setChannelId] = useState("");
  const [guildId, setGuildId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channelId.trim() || !message.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      const body: Record<string, string> = { channelId: channelId.trim(), message: message.trim() };
      if (guildId.trim()) body.guildId = guildId.trim();

      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.ok) {
        setStatus({ ok: true, text: "Message sent." });
        setMessage("");
      } else {
        setStatus({ ok: false, text: data.error || "Unknown error" });
      }
    } catch (err: unknown) {
      setStatus({ ok: false, text: "Network error: " + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "36px 40px", width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" fill="#5865f2"/>
          </svg>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff", letterSpacing: "0.02em" }}>Message Sender</div>
            <div style={{ fontSize: "0.78rem", color: "#555", marginTop: 1 }}>Send via selfbot</div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #1e1e1e", margin: "0 0 22px" }} />

        <form onSubmit={handleSubmit}>
          {/* Channel ID + Server ID row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Channel ID <span style={{ color: "#cf6f6f" }}>*</span></label>
              <input
                style={inputStyle}
                type="text"
                placeholder="123456789012345678"
                value={channelId}
                onChange={e => setChannelId(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Server ID</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="optional"
                value={guildId}
                onChange={e => setGuildId(e.target.value)}
                autoComplete="off"
              />
              <div style={{ fontSize: "0.72rem", color: "#444", marginTop: 5 }}>Only needed if not in cache</div>
            </div>
          </div>

          {/* Message */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Message <span style={{ color: "#cf6f6f" }}>*</span></label>
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: "vertical", lineHeight: 1.5 }}
              placeholder="Type your message here…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} style={btnStyle(loading)}>
            {loading ? "Sending…" : "Send Message"}
          </button>
        </form>

        {status && (
          <div style={{
            marginTop: 16,
            padding: "11px 14px",
            borderRadius: 7,
            fontSize: "0.85rem",
            background: status.ok ? "#1a2b1a" : "#2b1a1a",
            border: `1px solid ${status.ok ? "#2d5a2d" : "#5a2d2d"}`,
            color: status.ok ? "#6fcf6f" : "#cf6f6f",
          }}>
            {status.ok ? "✓ " : "✗ "}{status.text}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d0d0d",
  border: "1px solid #2a2a2a",
  borderRadius: 7,
  color: "#e0e0e0",
  fontFamily: "inherit",
  fontSize: "0.92rem",
  padding: "10px 13px",
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  width: "100%",
  background: disabled ? "#2a2a2a" : "#5865f2",
  color: disabled ? "#555" : "#fff",
  border: "none",
  borderRadius: 7,
  fontFamily: "inherit",
  fontSize: "0.95rem",
  fontWeight: 600,
  padding: 12,
  cursor: disabled ? "not-allowed" : "pointer",
  marginTop: 4,
});

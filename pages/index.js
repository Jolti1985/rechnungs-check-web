import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
    setResult(null);

    if (!file) {
      setError("Bitte zuerst eine PDF oder ein Bild auswählen.");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Analyse fehlgeschlagen.");
      setResult(data);
    } catch (e) {
      setError(e?.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "Arial, sans-serif", padding: 40, maxWidth: 980 }}>
      <h1 style={{ marginBottom: 6 }}>Rechnungs-Check Web Demo</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        PDF oder Screenshot hochladen → Rechnung/Mahnung erkennen → Positionen anzeigen → DE→EN (Demo) → Ampel.
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button
            onClick={analyze}
            disabled={loading}
            style={{
              padding: "10px 18px",
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              borderRadius: 8,
              border: "1px solid #bbb",
              background: loading ? "#eee" : "#fff",
              fontWeight: 600,
            }}
          >
            {loading ? "Analysiere…" : "Analyse starten"}
          </button>

          {file && (
            <span style={{ color: "#333", fontSize: 13 }}>
              Datei: <b>{file.name}</b>
            </span>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ marginBottom: 10 }}>Ergebnis</h2>

          {/* Ampel */}
          {result?.traffic_light && (
            <TrafficLightBox traffic={result.traffic_light} />
          )}

          {/* Basisinfos */}
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Anbieter" value={result.provider} />
            <Field label="Dokumenttyp" value={result.document_type} />
            <Field label="Rechnungsmonat" value={result.invoice_month} />
            <Field label="Rechnungsnummer" value={result.invoice_number} />
            <Field label="Zu zahlen" value={result.total_amount} />
            <Field label="Zahlungsziel / Datum" value={result.payment_due} />
            <Field label="Kündbar ab" value={result.cancelable_from} />
            <Field label="Übersetzung" value={result.translation_mode} />
          </div>

          {/* Positionen */}
          <h3 style={{ marginTop: 18 }}>Positionen (DE → EN)</h3>
          <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
            {Array.isArray(result.items) && result.items.length > 0 ? (
              result.items.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    borderTop: idx ? "1px solid #eee" : "none",
                    background: idx % 2 ? "#fff" : "#fcfcfc",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                    <div>
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 12, color: "#777" }}>DE</div>
                        <div style={{ fontWeight: 600 }}>{it.de || "—"}</div>
                      </div>

                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 12, color: "#777" }}>EN</div>
                        <div style={{ fontWeight: 600 }}>{it.en || "—"}</div>
                      </div>

                      {it.explain && (
                        <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
                          {it.explain}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#777" }}>Betrag</div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>
                        {it.amount || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 12 }}>Keine Positionen gefunden.</div>
            )}
          </div>

          {/* Zahlungsdetails */}
          <h3 style={{ marginTop: 18 }}>Zahlungsdetails</h3>
          <pre style={{ background: "#f4f4f4", padding: 16, borderRadius: 10, overflow: "auto" }}>
{JSON.stringify(result.payment || {}, null, 2)}
          </pre>
        </div>
      )}

      <footer style={{ marginTop: 30, color: "#777", fontSize: 12 }}>
        Demo-Stand: PDF wird lokal im Vercel-Backend ausgelesen (Regex/Parser). Echte Übersetzung & Erklärungen kommen als nächstes per OpenAI.
      </footer>
    </main>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value || "—"}</div>
    </div>
  );
}

function TrafficLightBox({ traffic }) {
  const status = (traffic?.status || "yellow").toLowerCase();
  const reasons = Array.isArray(traffic?.reasons) ? traffic.reasons : [];

  const bg =
    status === "red" ? "#ffe5e5" : status === "green" ? "#e6ffef" : "#fff7cc";

  const label =
    status === "red" ? "ROT" : status === "green" ? "GRÜN" : "GELB";

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: "1px solid #eee",
        background: bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b>Ampel:</b>
        <span
          style={{
            padding: "5px 12px",
            borderRadius: 999,
            border: "1px solid #ddd",
            fontWeight: 800,
            background: "#fff",
          }}
        >
          {label}
        </span>
      </div>

      <ul style={{ marginTop: 10, marginBottom: 0 }}>
        {reasons.length ? reasons.map((r, i) => <li key={i}>{r}</li>) : <li>Keine Gründe ausgegeben.</li>}
      </ul>
    </div>
  );
}

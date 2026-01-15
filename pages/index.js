import { useState } from "react";

function TrafficLight({ data }) {
  if (!data || !data.status) return null;

  const colors = {
    green: "#2ecc71",
    yellow: "#f1c40f",
    red: "#e74c3c",
  };

  const bg = {
    green: "#eafff2",
    yellow: "#fff8dd",
    red: "#ffe8e8",
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 10,
        border: "1px solid #e5e5e5",
        background: bg[data.status] || "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: colors[data.status] || "#aaa",
          }}
        />
        <div style={{ fontWeight: 800 }}>
          Ampel: {String(data.status).toUpperCase()}
        </div>
      </div>

      <ul style={{ marginTop: 10, marginBottom: 0 }}>
        {(data.reasons || []).map((r, i) => (
          <li key={i} style={{ color: "#333" }}>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value || "—"}</div>
    </div>
  );
}

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
    <main
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        padding: 40,
        maxWidth: 980,
      }}
    >
      <h1 style={{ marginBottom: 6 }}>Rechnungs-Check Web Demo</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Upload → Analyse → Ergebnis + Positionen (Demo) + Ampel (Demo)
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
              fontWeight: 700,
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
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {error}
          </div>
        )}
      </div>

      {result && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ marginBottom: 10 }}>Ergebnis</h2>

          {/* ✅ Ampel sichtbar sobald API traffic_light liefert */}
          <TrafficLight data={result.traffic_light} />

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Card label="Anbieter" value={result.provider} />
            <Card label="Dokumenttyp" value={result.document_type} />
            <Card label="Rechnungsmonat" value={result.invoice_month} />
            <Card label="Rechnungsnummer" value={result.invoice_number} />
            <Card label="Zu zahlen" value={result.total_amount} />
            <Card label="Zahlungsziel / Datum" value={result.payment_due} />
            <Card label="Kündbar ab" value={result.cancelable_from} />
            <Card label="Übersetzung" value={result.translation_mode} />
          </div>

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
                      <div style={{ fontSize: 12, color: "#777" }}>DE</div>
                      <div style={{ fontWeight: 800 }}>{it.de || "—"}</div>

                      <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>EN</div>
                      <div style={{ fontWeight: 800 }}>{it.en || "—"}</div>

                      {it.explain && (
                        <div style={{ marginTop: 8, color: "#444", fontSize: 13 }}>
                          {it.explain}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#777" }}>Betrag</div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
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

          <h3 style={{ marginTop: 18 }}>Zahlungsdetails</h3>
          <pre
            style={{
              background: "#f4f4f4",
              padding: 16,
              borderRadius: 10,
              overflow: "auto",
            }}
          >
{JSON.stringify(result.payment || {}, null, 2)}
          </pre>
        </section>
      )}

      <footer style={{ marginTop: 30, color: "#777", fontSize: 12 }}>
        Demo: Ampel/Positionen sind Demo-Logik. Als nächstes: echte PDF-Auslese + OpenAI Übersetzung/Erklärung.
      </footer>
    </main>
  );
}

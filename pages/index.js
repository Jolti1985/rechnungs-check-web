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
      setError(e.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: "Arial", padding: 40, maxWidth: 900 }}>
      <h1>Rechnungs-Check Web Demo</h1>
      <p>PDF oder Screenshot hochladen → Demo-Auswertung anzeigen</p>

      <div style={{ marginTop: 20, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <div style={{ marginTop: 12 }}>
          <button
            onClick={analyze}
            disabled={loading}
            style={{ padding: "12px 20px", fontSize: 16, cursor: "pointer" }}
          >
            {loading ? "Analysiere…" : "Analyse starten"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "crimson" }}>
            {error}
          </div>
        )}
      </div>

      {result && (
        <div style={{ marginTop: 20 }}>
          <h2>Ergebnis (Demo)</h2>
        {result.traffic_light && (
  <div style={{
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #eee"
  }}>
    <b>Ampel:</b>{" "}
    <span style={{
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid #ddd",
      display: "inline-block",
      marginLeft: 8
    }}>
      {result.traffic_light.status.toUpperCase()}
    </span>
    <ul style={{ marginTop: 8 }}>
      {result.traffic_light.reasons?.map((r, i) => <li key={i}>{r}</li>)}
    </ul>
  </div>
)}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Anbieter" value={result.provider} />
            <Field label="Dokumenttyp" value={result.document_type} />
            <Field label="Rechnungsmonat" value={result.invoice_month} />
            <Field label="Rechnungsnummer" value={result.invoice_number} />
            <Field label="Zu zahlen" value={result.total_amount} />
            <Field label="Zahlungsziel" value={result.payment_due} />
            <Field label="Kündbar ab" value={result.cancelable_from} />
            <Field label="Sprache" value={result.translation_mode} />
          </div>

          <h3 style={{ marginTop: 18 }}>Positionen (DE → EN)</h3>
          <div style={{ border: "1px solid #eee", borderRadius: 8 }}>
            {result.items?.map((it, idx) => (
              <div key={idx} style={{ padding: 12, borderTop: idx ? "1px solid #eee" : "none" }}>
                <div><b>DE:</b> {it.de}</div>
                <div><b>EN:</b> {it.en}</div>
                <div><b>Betrag:</b> {it.amount}</div>
                {it.explain && <div style={{ marginTop: 6, color: "#444" }}>{it.explain}</div>}
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 18 }}>Zahlungsdetails</h3>
          <pre style={{ background: "#f4f4f4", padding: 16, borderRadius: 8 }}>
{JSON.stringify(result.payment, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}

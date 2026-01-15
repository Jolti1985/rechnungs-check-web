import { useMemo, useState } from "react";

const DAILY_LIMIT = 3;

function getUsageKey() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `rc_usage_${today}`;
}

function readUsage() {
  try {
    const raw = localStorage.getItem(getUsageKey());
    if (!raw) return { count: 0 };
    const parsed = JSON.parse(raw);
    return { count: Number(parsed.count || 0) };
  } catch {
    return { count: 0 };
  }
}

function writeUsage(count) {
  try {
    localStorage.setItem(getUsageKey(), JSON.stringify({ count }));
  } catch {
    // ignore
  }
}

function incUsage() {
  const u = readUsage();
  const next = u.count + 1;
  writeUsage(next);
  return next;
}

function Badge({ children }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: "#fff",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}

function TrafficLight({ traffic }) {
  if (!traffic?.status) return null;
  const status = traffic.status.toLowerCase();
  const dot =
    status === "red" ? "#e74c3c" : status === "green" ? "#2ecc71" : "#f1c40f";
  const bg =
    status === "red" ? "#ffe8e8" : status === "green" ? "#eafff2" : "#fff8dd";

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        border: "1px solid #eee",
        background: bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: dot }} />
        <div style={{ fontWeight: 900 }}>Ampel: {status.toUpperCase()}</div>
        {traffic.score != null && <Badge>Score: {traffic.score}/100</Badge>}
      </div>
      <ul style={{ marginTop: 10, marginBottom: 0 }}>
        {(traffic.reasons || []).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900 }}>{value || "—"}</div>
    </div>
  );
}

function ItemsTable({ items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <div style={{ padding: 12 }}>Keine Positionen gefunden.</div>;
  }
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
      {items.map((it, idx) => (
        <div
          key={idx}
          style={{
            padding: 12,
            borderTop: idx ? "1px solid #eee" : "none",
            background: idx % 2 ? "#fff" : "#fcfcfc",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>DE</div>
              <div style={{ fontWeight: 900 }}>{it.de || "—"}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>EN</div>
              <div style={{ fontWeight: 900 }}>{it.en || "—"}</div>
              {it.explain_en && <div style={{ marginTop: 8, color: "#334155" }}>{it.explain_en}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Betrag</div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{it.amount || "—"}</div>
              {it.type && (
                <div style={{ marginTop: 6 }}>
                  <Badge>{it.type}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canExport = useMemo(() => !!result, [result]);

  async function analyze() {
    setError("");
    setResult(null);

    if (!file) {
      setError("Bitte zuerst eine PDF auswählen.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("In der kostenlosen Testphase ist nur PDF erlaubt.");
      return;
    }

    // Tageslimit (kostenlos, pro Gerät/Browser)
    let usage;
    try {
      usage = readUsage();
    } catch {
      usage = { count: 0 };
    }
    if (usage.count >= DAILY_LIMIT) {
      setError(`Tageslimit erreicht: ${DAILY_LIMIT} Uploads/Tag (Testphase).`);
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Analyse fehlgeschlagen.");

      // erst nach erfolgreicher Analyse zählen
      incUsage();
      setResult(data);
    } catch (e) {
      setError(e?.message || "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  async function exportPdf() {
    try {
      const res = await fetch("/api/export_pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "PDF Export fehlgeschlagen.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "rechnungs-check_ergebnis.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.message || "PDF Export fehlgeschlagen.");
    }
  }

  // Anzeige fürs Limit
  const usageInfo = useMemo(() => {
    if (typeof window === "undefined") return { count: 0 };
    return readUsage();
  }, [result, error, file, loading]);

  return (
    <main style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif', padding: 40, maxWidth: 1050 }}>
      <h1 style={{ marginBottom: 6 }}>Rechnungs-Check (kostenlose PDF-Demo)</h1>
      <p style={{ marginTop: 0, color: "#475569" }}>
        Nur PDF (kostenlos) → Rechnung/Mahnung erkennen → Positionen + DE→EN (Glossar) → Ampel → optional PDF Export.
      </p>

      <div style={{ marginTop: 18, padding: 16, border: "1px solid #ddd", borderRadius: 14, background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            onClick={analyze}
            disabled={loading}
            style={{
              padding: "10px 18px",
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              borderRadius: 10,
              border: "1px solid #bbb",
              background: loading ? "#eee" : "#fff",
              fontWeight: 900,
            }}
          >
            {loading ? "Analysiere…" : "Analyse starten"}
          </button>

          <button
            onClick={exportPdf}
            disabled={!canExport}
            style={{
              padding: "10px 18px",
              fontSize: 15,
              cursor: canExport ? "pointer" : "not-allowed",
              borderRadius: 10,
              border: "1px solid #bbb",
              background: canExport ? "#fff" : "#eee",
              fontWeight: 900,
            }}
          >
            Ergebnis als PDF
          </button>

          <Badge>
            Heute genutzt: {usageInfo.count}/{DAILY_LIMIT}
          </Badge>

          {file && (
            <span style={{ color: "#334155", fontSize: 13 }}>
              Datei: <b>{file.name}</b>
            </span>
          )}
        </div>

        {error && <div style={{ marginTop: 12, color: "crimson", fontWeight: 900 }}>{error}</div>}
      </div>

      {result && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ marginBottom: 10 }}>Ergebnis</h2>

          <TrafficLight traffic={result.traffic_light} />

          {result.warnings?.length ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fff" }}>
              <b>Hinweise</b>
              <ul style={{ marginTop: 8, marginBottom: 0 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card label="Anbieter" value={result.provider} />
            <Card label="Dokumenttyp" value={result.document_type} />
            <Card label="Rechnungsnummer" value={result.invoice_number} />
            <Card label="Rechnungsdatum" value={result.invoice_date} />
            <Card label="Zeitraum" value={result.billing_period} />
            <Card label="Zu zahlen" value={result.total_amount} />
            <Card label="Offen (bei Mahnung)" value={result.outstanding_amount} />
            <Card label="Zahlungsziel" value={result.payment_due} />
            <Card label="Kündbar ab" value={result.cancelable_from} />
            <Card label="Kündigungsfrist" value={result.notice_period} />
          </div>

          <h3 style={{ marginTop: 18 }}>Positionen (DE → EN)</h3>
          <ItemsTable items={result.items} />

          <h3 style={{ marginTop: 18 }}>Zahlungsdetails</h3>
          <pre style={{ background: "#f4f4f4", padding: 16, borderRadius: 12, overflow: "auto" }}>
{JSON.stringify(result.payment || {}, null, 2)}
          </pre>

          {result.next_actions?.length ? (
            <>
              <h3 style={{ marginTop: 18 }}>Empfehlungen</h3>
              <ul>
                {result.next_actions.map((a, i) => (
                  <li key={i}>
                    <b>{a.title}:</b> {a.text}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      )}

      <footer style={{ marginTop: 30, color: "#64748b", fontSize: 12 }}>
        Kostenlos-Test: Nur PDFs mit kopierbarem Text liefern die besten Ergebnisse. Screenshots/OCR kommen später (kostenpflichtig/mit KI).
      </footer>
    </main>
  );
}

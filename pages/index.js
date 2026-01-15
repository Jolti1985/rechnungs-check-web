import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState(null);

  async function analyze() {
    const res = await fetch("/api/analyze");
    const data = await res.json();
    setResult(data);
  }

  return (
    <main style={{ fontFamily: "Arial", padding: 40 }}>
      <h1>Rechnungs-Check Web Demo</h1>
      <p>Analyse von Mobilfunk- & Festnetzrechnungen (Demo)</p>

      <button
        onClick={analyze}
        style={{
          padding: "12px 20px",
          fontSize: 16,
          cursor: "pointer",
          marginTop: 20
        }}
      >
        Demo-Analyse starten
      </button>

      {result && (
        <pre
          style={{
            marginTop: 30,
            background: "#f4f4f4",
            padding: 20,
            borderRadius: 6
          }}
        >
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}

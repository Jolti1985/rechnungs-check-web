export const config = {
  api: { bodyParser: false },
};

// Minimaler Multipart-"Parser" nur um filename zu bekommen (Demo).
async function readFilename(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("binary");

  const m = raw.match(/filename="([^"]+)"/);
  return m ? m[1] : "upload";
}

function parseAmountToNumber(amountStr) {
  if (!amountStr) return 0;
  // "170,37 €" -> 170.37
  const cleaned = String(amountStr)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "")
    .trim();

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function buildTrafficLight({ documentType, totalAmount, paymentDue }) {
  const dt = (documentType || "").toLowerCase();
  const reasons = [];

  // Regeln (Demo):
  // - Mahnung => rot
  // - Rechnung mit Betrag > 0 => gelb
  // - sonst grün

  if (dt.includes("mahnung")) {
    reasons.push("Dokument als Mahnung erkannt (Demo-Regel).");
    reasons.push("Bitte offenen Betrag zeitnah begleichen.");
    return { status: "red", reasons };
  }

  const amountNum = parseAmountToNumber(totalAmount);
  if (amountNum > 0) {
    reasons.push("Rechnung enthält einen zu zahlenden Betrag (Demo-Regel).");
    if (paymentDue) reasons.push(`Zahlungsziel erkannt: ${paymentDue}`);
    else reasons.push("Kein Zahlungsziel erkannt (Demo).");
    return { status: "yellow", reasons };
  }

  reasons.push("Kein offener Betrag erkannt (Demo-Regel).");
  return { status: "green", reasons };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const filename = await readFilename(req);
  const lower = filename.toLowerCase();

  // Provider-Erkennung (Demo nur über Dateinamen)
  const provider =
    lower.includes("telekom") || lower.includes("rechnung")
      ? "Telekom"
      : lower.includes("vodafone")
      ? "Vodafone"
      : lower.includes("o2")
      ? "o2"
      : lower.includes("congstar")
      ? "congstar"
      : "Unbekannt";

  // Dokumenttyp Demo
  const document_type = lower.includes("mahnung") ? "Mahnung (Demo)" : "Rechnung (Demo)";

  // Demo-Daten (Telekom-Beispiel)
  const invoice_month = "Oktober 2020";
  const invoice_number = "75 6354 4858";
  const total_amount = "170,37 €";
  const payment_due = "14.10.2020 (Demo)";
  const cancelable_from = "19.07.2021 (Demo)";

  // Demo-Positionen + DE→EN
  const items = [
    {
      de: "MagentaZuhause M Hybrid",
      en: "MagentaZuhause M Hybrid (plan)",
      amount: "29,36 €",
      explain: "Monatliche Grundgebühr (Demo)",
    },
    {
      de: "Speedport Pro Endgeräte-Servicepaket",
      en: "Speedport Pro device service package",
      amount: "8,36 €",
      explain: "Monatliche Zusatzleistung (Demo)",
    },
    {
      de: "Fehlerbehebung Heimnetz",
      en: "Home network troubleshooting",
      amount: "67,18 €",
      explain: "Einmalige Leistung (Demo)",
    },
    {
      de: "Technische Leistung M",
      en: "Technical service M",
      amount: "41,97 €",
      explain: "Einmalige Leistung (Demo)",
    },
  ];

  const payment = {
    reference: "Mandatsreferenz / Rechnungsnr. (Demo)",
    iban: "DE00 0000 0000 0000 0000 00 (Demo)",
    bic: "XXXXDEXX (Demo)",
    purpose: `Rechnungsnummer ${invoice_number}`,
    note: "Bankdaten werden später aus PDF-Inhalt extrahiert (Parser + OpenAI).",
  };

  // ✅ Ampel immer berechnen und mitsenden
  const traffic_light = buildTrafficLight({
    documentType: document_type,
    totalAmount: total_amount,
    paymentDue: payment_due,
  });

  return res.status(200).json({
    provider,
    document_type,
    invoice_month,
    invoice_number,
    total_amount,
    payment_due,
    cancelable_from,
    translation_mode: "DE → EN (Demo)",
    traffic_light, // ✅ entscheidend
    items,
    payment,
    debug: {
      received_filename: filename,
      note: "Demo: wir nutzen aktuell nur filename; echte PDF-Auslese kommt als nächstes.",
    },
  });
}


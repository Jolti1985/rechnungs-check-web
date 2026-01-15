export const config = {
  api: { bodyParser: false },
};

async function readFileName(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("binary");

  // rudimentär: filename="..."
  const m = body.match(/filename="([^"]+)"/);
  return m ? m[1] : "upload";
}

function buildTrafficLight({ documentType, totalAmount, paymentDue }) {
  // Demo-Logik (später wird das aus PDF-Inhalt + OpenAI abgeleitet)
  // Regeln:
  // - Mahnung => rot
  // - Zahlungsziel vorhanden und Betrag > 0 => gelb
  // - sonst grün

  const reasons = [];

  if ((documentType || "").toLowerCase().includes("mahnung")) {
    reasons.push("Dokument als Mahnung erkannt (Demo-Regel).");
    reasons.push("Offener Betrag sollte zeitnah beglichen werden.");
    return { status: "red", reasons };
  }

  // Betrag-Check (sehr einfach)
  const amountNum = typeof totalAmount === "string"
    ? parseFloat(totalAmount.replace(".", "").replace(",", ".").replace("€", "").trim()) || 0
    : 0;

  if (amountNum > 0) {
    reasons.push("Rechnung enthält einen zu zahlenden Betrag.");
    if (paymentDue) reasons.push(`Zahlungsziel erkannt: ${paymentDue}`);
    else reasons.push("Kein Zahlungsziel erkannt (Demo).");
    return { status: "yellow", reasons };
  }

  reasons.push("Kein offener Betrag erkannt (Demo).");
  return { status: "green", reasons };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const filename = await readFileName(req);
  const lower = filename.toLowerCase();

  // Demo: Provider-Erkennung am Dateinamen (später am Inhalt)
  const provider =
    lower.includes("telekom") || lower.includes("rechnung") ? "Telekom" :
    lower.includes("vodafone") ? "Vodafone" :
    lower.includes("o2") ? "o2" :
    lower.includes("congstar") ? "congstar" :
    "Unbekannt";

  // Demo: dokumenttyp am dateinamen erkennen
  const document_type = lower.includes("mahnung") ? "Mahnung (Demo)" : "Rechnung (Demo)";

  // Demo: feste Beispielwerte (wie bei deiner Telekom-Rechnung)
  const invoice_month = "Oktober 2020";
  const invoice_number = "75 6354 4858";
  const total_amount = "170,37 €";
  const payment_due = "14.10.2020 (Demo)";
  const cancelable_from = "19.07.2021 (Demo)";

  const items = [
    { de: "MagentaZuhause M Hybrid", en: "MagentaZuhause M Hybrid (plan)", amount: "29,36 €", explain: "Monatliche Grundgebühr (Demo)" },
    { de: "Speedport Pro Endgeräte-Servicepaket", en: "Speedport Pro device service package", amount: "8,36 €", explain: "Monatliche Zusatzleistung (Demo)" },
    { de: "Fehlerbehebung Heimnetz", en: "Home network troubleshooting", amount: "67,18 €", explain: "Einmalige Leistung (Demo)" },
    { de: "Technische Leistung M", en: "Technical service M", amount: "41,97 €", explain: "Einmalige Leistung (Demo)" },
  ];

  const payment = {
    reference: "Mandatsreferenz / Rechnungsnr. (Demo)",
    iban: "DE00 0000 0000 0000 0000 00 (Demo)",
    bic: "XXXXDEXX (Demo)",
    purpose: "Rechnungsnummer 75 6354 4858",
    note: "Bankdaten werden später aus PDF-Inhalt extrahiert (OpenAI + Parser)."
  };

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
    traffic_light, // ✅ HIER IST DIE AMPEL
    items,
    payment
  });
}

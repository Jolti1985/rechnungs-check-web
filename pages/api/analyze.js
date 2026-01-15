export const config = {
  api: { bodyParser: false },
};

async function readFileName(req) {
  // Minimal: wir lesen nur den Dateinamen aus dem Multipart-Body (Demo)
  // Für echte Verarbeitung nutzen wir später PDF/Text-Extraktion + OpenAI.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("binary");

  // rudimentär: filename="..."
  const m = body.match(/filename="([^"]+)"/);
  return m ? m[1] : "upload";
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

  // Demo: feste Beispielausgabe (so wie bei deiner Telekom-Rechnung)
  return res.status(200).json({
    provider,
    document_type: "Rechnung (Demo)",
    invoice_month: "Oktober 2020",
    invoice_number: "75 6354 4858",
    total_amount: "170,37 €",
    payment_due: "14.10.2020 (Demo)",
    cancelable_from: "19.07.2021 (Demo)",
    translation_mode: "DE → EN (Demo)",
    items: [
      { de: "MagentaZuhause M Hybrid", en: "MagentaZuhause M Hybrid (plan)", amount: "29,36 €", explain: "Monatliche Grundgebühr (Demo)" },
      { de: "Speedport Pro Endgeräte-Servicepaket", en: "Speedport Pro device service package", amount: "8,36 €", explain: "Monatliche Zusatzleistung (Demo)" },
      { de: "Fehlerbehebung Heimnetz", en: "Home network troubleshooting", amount: "67,18 €", explain: "Einmalige Leistung (Demo)" },
      { de: "Technische Leistung M", en: "Technical service M", amount: "41,97 €", explain: "Einmalige Leistung (Demo)" },
    ],
    payment: {
      reference: "Mandatsreferenz / Rechnungsnr. (Demo)",
      iban: "DE00 0000 0000 0000 0000 00 (Demo)",
      bic: "XXXXDEXX (Demo)",
      purpose: "Rechnungsnummer 75 6354 4858",
      note: "Bankdaten werden später aus PDF-Inhalt extrahiert (OpenAI + Parser)."
    }
  });
}

import Busboy from "busboy";
import pdfParse from "pdf-parse";

export const config = {
  api: { bodyParser: false },
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    let fileBuffer = Buffer.alloc(0);
    let fileName = "upload";
    let mimeType = "application/octet-stream";

    bb.on("file", (_name, file, info) => {
      fileName = info.filename || "upload";
      mimeType = info.mimeType || info.mimetype || mimeType;

      file.on("data", (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
      file.on("error", reject);
    });

    bb.on("finish", () => resolve({ fileBuffer, fileName, mimeType }));
    bb.on("error", reject);

    req.pipe(bb);
  });
}

function detectProvider(text) {
  const t = text.toLowerCase();
  if (t.includes("telekom deutschland") || t.includes("erleben, was verbindet") || t.includes("magenta")) return "Telekom";
  if (t.includes("vodafone")) return "Vodafone";
  if (t.includes("telefonica") || t.includes("o2")) return "o2";
  if (t.includes("congstar")) return "congstar";
  return "Unbekannt";
}

function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? m[1].trim() : "";
}

function normalizeEuro(s) {
  if (!s) return "";
  return s.replace(/\s/g, "").replace(".", "").replace(",", "."); // "170,37" -> "170.37"
}

function euroToNumber(euroStr) {
  const n = parseFloat(normalizeEuro(euroStr));
  return Number.isFinite(n) ? n : null;
}

/**
 * Sehr einfache Telekom-Positions-Erkennung:
 * Wir suchen Zeilen, die am Ende einen Betrag haben, z.B. "MagentaZuhause ... 29,36"
 */
function extractItemsFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  const amountRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/; // 29,36 / 1.234,56

  // Nur sinnvolle Zeilen: nicht zu kurz, nicht nur Zahlen
  for (const line of lines) {
    const m = line.match(amountRegex);
    if (!m) continue;

    const amount = m[1];
    const desc = line.replace(amountRegex, "").trim();

    if (desc.length < 6) continue;
    if (/^ust\.?/i.test(desc)) continue;
    if (/summe|gesamt|zu zahlen|nettobetrag|bruttobetrag/i.test(desc)) continue;

    items.push({ de: desc, amount: `${amount} €` });
  }

  // Duplikate raus
  const uniq = [];
  const seen = new Set();
  for (const it of items) {
    const key = `${it.de}__${it.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }

  // Nicht “zu viel” ausgeben (Demo)
  return uniq.slice(0, 12);
}

const DICT = [
  ["Monatliche Grundgebühr", "Monthly base fee"],
  ["Monatliche Zusatzleistung", "Monthly add-on"],
  ["Einmalige Leistung", "One-time service"],
  ["Technische Leistung", "Technical service"],
  ["Fehlerbehebung", "Troubleshooting"],
  ["Heimnetz", "Home network"],
  ["Endgeräte", "Devices"],
  ["Servicepaket", "Service package"],
  ["Speedport", "Speedport"],
  ["MagentaZuhause", "MagentaZuhause"],
];

function translateDEtoEN(de) {
  let en = de;

  for (const [a, b] of DICT) {
    en = en.replaceAll(a, b);
  }

  // kleine Heuristiken
  en = en.replaceAll("für", "for");
  en = en.replaceAll("und", "and");

  // wenn sich nichts geändert hat → markiere als “unklar”
  if (en === de) en = `${de} (EN translation pending)`;

  return en;
}

function trafficLight({ total, oneTimeTotal, cancelableFrom, isReminder }) {
  const reasons = [];
  let status = "green";

  if (isReminder) {
    status = "red";
    reasons.push("Mahn-/Reminder-Dokument erkannt → Zahlung kritisch.");
  }

  if (oneTimeTotal != null && oneTimeTotal >= 50) {
    status = status === "red" ? "red" : "yellow";
    reasons.push("Hohe Einmalbeträge erkannt.");
  }

  if (total != null && total >= 150) {
    status = status === "red" ? "red" : "yellow";
    reasons.push("Hoher Rechnungsbetrag (Demo-Regel).");
  }

  if (cancelableFrom) {
    status = status === "red" ? "red" : "yellow";
    reasons.push("Vertrag könnte kündbar sein (Datum erkannt).");
  }

  if (reasons.length === 0) reasons.push("Keine Auffälligkeiten nach Demo-Regeln.");
  return { status, reasons };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const { fileBuffer, fileName, mimeType } = await parseMultipart(req);

    // Bild/Screenshot: noch Demo (später OCR/OpenAI Vision)
    if (mimeType.startsWith("image/")) {
      const demo = {
        provider: "Unbekannt",
        document_type: "Screenshot (Demo – OCR folgt)",
        invoice_month: "",
        invoice_number: "",
        total_amount: "",
        payment_due: "",
        cancelable_from: "",
        translation_mode: "DE → EN (Demo)",
        items: [
          { de: "Screenshot erkannt – OCR folgt", en: "Screenshot detected – OCR coming next", amount: "" }
        ],
        traffic_light: { status: "yellow", reasons: ["Screenshot ohne OCR – bitte PDF testen (Demo)."] },
        payment: { note: "Für Screenshots bauen wir OCR als nächsten Schritt ein." }
      };
      return res.status(200).json(demo);
    }

    // PDF-Text extrahieren
    let text = "";
    if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      const parsed = await pdfParse(fileBuffer);
      text = parsed.text || "";
    } else {
      // andere Formate: Demo
      text = "";
    }

    const provider = detectProvider(text || fileName);

    // Rechnung/Mahnung grob erkennen
    const isReminder = /mahnung|zahlungserinnerung|offener betrag/i.test(text);

    // Telekom typische Felder (sehr grob)
    const invoiceNumber =
      firstMatch(text, /Rechnungsnummer\s*([\d\s]+)/i) ||
      firstMatch(text, /Rechnung\s*Nr\.?\s*([\d\s]+)/i);

    const date =
      firstMatch(text, /Datum\s*(\d{2}\.\d{2}\.\d{4})/i);

    const total =
      firstMatch(text, /Zu zahlender Betrag\s*([\d\.,]+)\s*€?/i) ||
      firstMatch(text, /zu zahlen[:\s]*([\d\.,]+)\s*€?/i);

    const cancelableFrom =
      firstMatch(text, /Kündigung.*spätestens am:\s*(\d{2}\.\d{2}\.\d{2,4})/i) ||
      firstMatch(text, /Kündigung.*am\s*(\d{2}\.\d{2}\.\d{2,4})/i);

    const itemsRaw = extractItemsFromText(text);
    const items = itemsRaw.map((it) => ({
      de: it.de,
      en: translateDEtoEN(it.de),
      amount: it.amount,
      explain: it.de.length ? "Position aus PDF-Text erkannt (Demo-Regel)." : ""
    }));

    // Einmalbeträge grob schätzen: Wir nehmen Positionen, die nach “einmal” klingen
    let oneTimeTotal = 0;
    for (const it of items) {
      if (/fehlerbehebung|technische|einmal/i.test(it.de)) {
        const num = euroToNumber(it.amount);
        if (num != null) oneTimeTotal += num;
      }
    }
    if (oneTimeTotal === 0) oneTimeTotal = null;

    const totalNum = total ? euroToNumber(total) : null;

    const amp = trafficLight({
      total: totalNum,
      oneTimeTotal,
      cancelableFrom,
      isReminder
    });

    return res.status(200).json({
      provider,
      document_type: isReminder ? "Mahnung/Zahlungserinnerung (Demo)" : "Rechnung (PDF erkannt)",
      invoice_month: "", // kommt als nächstes (Monat aus Text)
      invoice_number: invoiceNumber || "",
      total_amount: total ? `${total} €` : "",
      payment_due: date ? `${date} (Datum erkannt)` : "",
      cancelable_from: cancelableFrom || "",
      translation_mode: "DE → EN (regelbasiert Demo)",
      traffic_light: amp,
      items: items.length ? items : [{ de: "Keine Positionen gefunden", en: "No line items found", amount: "" }],
      payment: {
        purpose: invoiceNumber ? `Rechnungsnummer ${invoiceNumber}` : "",
        note: "Bankdaten/IBAN kommen als nächstes aus dem PDF-Text (Demo-Ausbau).",
        file: fileName
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

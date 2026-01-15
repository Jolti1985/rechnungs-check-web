function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? (m[1] || "").trim() : "";
}

function normSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function simplify(s) {
  // macht Vergleiche robust: keine Leerzeichen, keine Sonderzeichen, alles klein
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, ""); // unicode letters+numbers only
}

function detectProvider(text, fileName = "") {
  const t = simplify(text);
  const f = simplify(fileName);
  if (t.includes("telekom") || t.includes("magenta") || f.includes("telekom")) return "Telekom";
  if (t.includes("vodafone") || f.includes("vodafone")) return "Vodafone";
  if (t.includes("telefonica") || t.includes("o2") || f.includes("o2")) return "o2";
  if (t.includes("congstar") || f.includes("congstar")) return "congstar";
  return "Unbekannt";
}

function detectDocType(text) {
  const t = simplify(text);
  if (t.includes("mahnung") || t.includes("zahlungserinnerung")) return "Mahnung/Zahlungserinnerung";
  if (t.includes("rechnung") || t.includes("rechnungsnummer") || t.includes("zuzahlen") || t.includes("rechnungsbetrag"))
    return "Rechnung";
  return "Unbekannt";
}

function toNumberEuro(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatEuro(s) {
  if (!s) return "";
  const v = String(s).trim();
  if (v.includes("€")) return normSpaces(v);
  if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(v)) return `${v} €`;
  return `${v} €`;
}

// ---------- Kostenloses DE->EN Demo-Glossar ----------
const GLOSSARY = [
  ["Rechnungsbetrag", "Invoice amount"],
  ["Zu zahlen", "Amount due"],
  ["Bitte überweisen", "Please transfer"],
  ["Grundgebühr", "Base fee"],
  ["Monat", "Month"],
  ["Einmal", "One-time"],
  ["Technische Leistung", "Technical service"],
  ["Fehlerbehebung", "Troubleshooting"],
  ["Heimnetz", "Home network"],
  ["Servicepaket", "Service package"],
  ["Rabatt", "Discount"],
  ["Gutschrift", "Credit"],
  ["MwSt", "VAT"],
  ["USt", "VAT"],
];

function translateGlossary(de) {
  let en = de;
  for (const [a, b] of GLOSSARY) en = en.replaceAll(a, b);
  if (en === de) return `${de} (EN)`;
  return en;
}

function guessType(de) {
  const s = (de || "").toLowerCase();
  if (s.includes("grundgebühr") || s.includes("monat") || s.includes("tarif") || s.includes("paket")) return "monthly";
  if (s.includes("einmal") || s.includes("anschluss") || s.includes("techniker") || s.includes("fehlerbehebung")) return "one_time";
  if (s.includes("minuten") || s.includes("sms") || s.includes("daten") || s.includes("verbindungen") || s.includes("roaming")) return "usage";
  if (s.includes("mwst") || s.includes("ust") || s.includes("steuer")) return "tax";
  return "other";
}

function explainEN(type) {
  if (type === "monthly") return "Recurring monthly charge (rule/glossary).";
  if (type === "one_time") return "One-time charge (rule/glossary).";
  if (type === "usage") return "Usage-based charge (rule/glossary).";
  if (type === "tax") return "VAT/tax line (rule/glossary).";
  return "Detected from PDF text (rule-based).";
}

// ---------- TOTAL robust ----------
function extractTotalAmount(text) {
  const t = text || "";
  const patterns = [
    /Rechnungsbetrag\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/i,
    /(Zu zahlen|Zu zahlender Betrag)\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/i,
    /(Gesamtbetrag|Summe)\s*[:\-]?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/i,
    /Bitte\s+überweisen\s+Sie\s+(?:den\s+)?Betrag\s+(?:von\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/i,
  ];
  for (const rx of patterns) {
    const m = t.match(rx);
    if (m) {
      const val = m.length >= 3 ? m[2] : m[1];
      return formatEuro(val);
    }
  }
  return "";
}

function isSummaryLikeRaw(desc) {
  const s = simplify(desc);

  // Alles, was Summenzeilen/Hinweise sind – auch ohne Leerzeichen!
  const bad = [
    "rechnungsbetrag",
    "gesamtbetrag",
    "summe",
    "zuzahlen",
    "zahlbetrag",
    "offenerbetrag",
    "bitteueberweisen",
    "bittedieberweisen",
    "bitteuberweisen", // falls u ohne umlaut
    "faelligam",
    "zahlungsziel",
  ];

  return bad.some((k) => s.includes(k));
}

function looksLikeMeta(desc) {
  const s = simplify(desc);
  return (
    s.includes("rechnungsnummer") ||
    s.includes("kundennummer") ||
    s.includes("iban") ||
    s.includes("bic") ||
    s.includes("datum") ||
    s.includes("zeitraum") ||
    s.includes("seite") ||
    s.includes("ustid") ||
    s.includes("steuer")
  );
}

// ✅ Neue, robustere Positions-Extraktion:
// - findet Beträge in Zeilen (auch wenn Betrag alleine steht)
// - nimmt Beschreibung aus der gleichen Zeile ODER aus den 1–2 Zeilen darüber
function extractItems(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rxAmountAnywhere = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/;
  const rxAmountEnd = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/;

  const items = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const m = line.match(rxAmountAnywhere);
    if (!m) continue;

    const amount = `${m[1]} €`;

    // 1) Beschreibung aus gleicher Zeile entfernen
    let desc = line.replace(rxAmountAnywhere, "").trim();

    // 2) Falls Beschreibung zu kurz/leer: nimm 1–2 Zeilen darüber
    if (!desc || desc.length < 6) {
      const prev1 = lines[i - 1] || "";
      const prev2 = lines[i - 2] || "";

      // nehme die beste (längere) Zeile als Beschreibung
      const cand = [prev1, prev2].filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";
      if (cand && cand.length >= 6) desc = cand.trim();
    }

    if (!desc || desc.length < 6) continue;
    if (isSummaryLikeRaw(desc)) continue;
    if (looksLikeMeta(desc)) continue;

    // harte Summenfilter zusätzlich: falls desc trotzdem "Bitteüberweisen..." ist
    if (simplify(desc).startsWith("bitteueberweisen") || simplify(desc).startsWith("bittedieberweisen")) continue;

    const key = `${simplify(desc)}__${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const type = guessType(desc);
    items.push({
      de: desc,
      en: translateGlossary(desc),
      amount,
      type,
      explain_en: explainEN(type),
    });

    if (items.length >= 30) break;
  }

  // Falls wir NUR 1 "Position" haben und die wie Summary aussieht, dann lieber leer
  if (items.length === 1 && isSummaryLikeRaw(items[0].de)) return [];

  return items;
}

function trafficLight({ docType, totalAmount, dueDate, items }) {
  const reasons = [];
  let score = 85;
  let status = "green";

  const isReminder =
    (docType || "").toLowerCase().includes("mahnung") ||
    (docType || "").toLowerCase().includes("zahlungserinnerung");

  if (isReminder) {
    return {
      status: "red",
      score: 20,
      reasons: ["Mahn-/Zahlungserinnerung erkannt → dringend prüfen/bezahlen."],
    };
  }

  const totalNum = toNumberEuro(totalAmount);
  if (totalNum == null) {
    status = "yellow";
    score = Math.min(score, 60);
    reasons.push("Gesamtbetrag nicht sicher erkannt.");
  } else {
    reasons.push(`Gesamtbetrag erkannt: ${totalAmount}`);
    if (totalNum >= 150) {
      status = "yellow";
      score = Math.min(score, 55);
      reasons.push("Hoher Rechnungsbetrag (regelbasiert).");
    }
  }

  if (dueDate) reasons.push(`Zahlungsziel: ${dueDate}`);
  else {
    status = "yellow";
    score = Math.min(score, 65);
    reasons.push("Zahlungsziel nicht erkannt (kann fehlen oder anders formuliert sein).");
  }

  if (!items || items.length === 0) {
    status = "yellow";
    score = Math.min(score, 60);
    reasons.push("Keine Einzelpositionen erkannt (PDF-Layout/Scan möglich).");
  } else {
    reasons.push(`${items.length} Position(en) erkannt.`);
  }

  return { status, score, reasons };
}

export function parseTelecomDoc({ text, fileName }) {
  const provider = detectProvider(text, fileName);
  const document_type = detectDocType(text);

  const invoice_number =
    firstMatch(text, /Rechnungsnummer\s*[:\-]?\s*([0-9\s]{6,})/i) ||
    firstMatch(text, /Rechnung\s*Nr\.?\s*[:\-]?\s*([0-9\s]{6,})/i) ||
    "";

  const invoice_date =
    firstMatch(text, /Rechnungsdatum\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    firstMatch(text, /Datum\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  const billing_period =
    firstMatch(
      text,
      /(Zeitraum|Abrechnungszeitraum)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4}\s*(?:-|–|bis)\s*\d{2}\.\d{2}\.\d{4})/i
    ) || "";

  const payment_due =
    firstMatch(text, /(Zahlungsziel|Fällig am|Bitte zahlen bis)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) || "";

  const total_amount = extractTotalAmount(text);

  const outstanding_amount =
    formatEuro(firstMatch(text, /(Offener Betrag|Noch offen|Zahlbetrag)\s*[:\-]?\s*([\d\.,]+)\s*€?/i)) || "";

  const cancelable_from =
    firstMatch(text, /(kündbar ab|Kündigung möglich ab)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    firstMatch(text, /(Vertragsende|Mindestlaufzeit bis)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  const notice_period = firstMatch(text, /(Kündigungsfrist)\s*[:\-]?\s*([^\n\r]+)/i) || "";

  const iban = firstMatch(text, /(IBAN)\s*[:\-]?\s*([A-Z]{2}\d{2}[A-Z0-9\s]{10,})/i) || "";
  const bic = firstMatch(text, /(BIC)\s*[:\-]?\s*([A-Z0-9]{8,11})/i) || "";
  const recipient = firstMatch(text, /(Empfänger|Begünstigter)\s*[:\-]?\s*([^\n\r]+)/i) || "";

  const items = extractItems(text);

  const traffic_light = trafficLight({
    docType: document_type,
    totalAmount: total_amount || outstanding_amount,
    dueDate: payment_due,
    items,
  });

  const warnings = [];
  if (!total_amount && !outstanding_amount) warnings.push("Betrag nicht sicher erkannt (prüfe PDF-Textqualität).");
  if (!invoice_number) warnings.push("Rechnungsnummer nicht sicher erkannt.");
  if (!iban && !bic) warnings.push("Keine Bankdaten (IBAN/BIC) sicher erkannt – kann je nach Anbieter/Format fehlen.");

  const next_actions = [];
  if (document_type.includes("Mahnung")) {
    next_actions.push({ title: "Pay now", text: "Reminder detected. Pay outstanding amount promptly." });
  } else {
    next_actions.push({ title: "Review", text: "Check total amount and line items for unusual charges." });
    if (cancelable_from) next_actions.push({ title: "Contract", text: "Cancelability date detected. Consider reviewing the contract." });
  }

  return {
    provider,
    document_type,
    invoice_number: normSpaces(invoice_number),
    invoice_date,
    billing_period: normSpaces(billing_period),
    total_amount,
    outstanding_amount,
    payment_due,
    cancelable_from,
    notice_period: normSpaces(notice_period),
    payment: {
      iban: normSpaces(iban),
      bic: normSpaces(bic),
      recipient: normSpaces(recipient),
      purpose: invoice_number ? `Invoice ${normSpaces(invoice_number)}` : "",
      how_to_pay_en: "Transfer the amount using the invoice number as payment reference (rule-based).",
    },
    items,
    traffic_light,
    warnings,
    next_actions,
  };
}

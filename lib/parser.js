// Kostenloser Parser (regelbasiert) für Telekom/Vodafone/o2/congstar + allgemein.
// Ziel: vorführbar, robust genug für textbasierte PDFs.

function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? (m[1] || "").trim() : "";
}

function normSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function detectProvider(text, fileName = "") {
  const t = (text || "").toLowerCase();
  const f = (fileName || "").toLowerCase();

  if (t.includes("telekom") || t.includes("magenta") || f.includes("telekom") || f.includes("rechnung")) return "Telekom";
  if (t.includes("vodafone") || f.includes("vodafone")) return "Vodafone";
  if (t.includes("o2") || t.includes("telefonica") || f.includes("o2")) return "o2";
  if (t.includes("congstar") || f.includes("congstar")) return "congstar";
  return "Unbekannt";
}

function detectDocType(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("mahnung") || t.includes("zahlungserinnerung")) return "Mahnung/Zahlungserinnerung";
  if (t.includes("rechnung") || t.includes("rechnungsnummer") || t.includes("zu zahlen")) return "Rechnung";
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
  // keep as "123,45 €" if already
  if (String(s).includes("€")) return normSpaces(String(s));
  return `${normSpaces(String(s))} €`;
}

// sehr simples LineItem: Zeilen, die am Ende einen Betrag haben
function extractItems(text) {
  const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rx = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/;

  const items = [];
  const seen = new Set();

  for (const line of lines) {
    const m = line.match(rx);
    if (!m) continue;

    const amount = `${m[1]} €`;
    const de = line.replace(rx, "").trim();

    if (de.length < 6) continue;
    if (/summe|gesamt|zu zahlen|nettobetrag|bruttobetrag|mwst|ust/i.test(de)) continue;

    const key = `${de}__${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const type = guessType(de);
    items.push({
      de,
      en: translateGlossary(de),
      amount,
      type,
      explain_en: explainEN(de, type)
    });

    if (items.length >= 14) break; // Demo: nicht zu viele
  }

  return items;
}

function guessType(de) {
  const s = de.toLowerCase();
  if (s.includes("grundgebühr") || s.includes("monat") || s.includes("tarif") || s.includes("paket")) return "monthly";
  if (s.includes("einmal") || s.includes("anschluss") || s.includes("techniker") || s.includes("fehlerbehebung")) return "one_time";
  if (s.includes("minuten") || s.includes("sms") || s.includes("daten") || s.includes("verbindungen") || s.includes("roaming")) return "usage";
  if (s.includes("mwst") || s.includes("ust") || s.includes("steuer")) return "tax";
  return "other";
}

// Kostenloses DE->EN Glossar (Demo-tauglich)
const GLOSSARY = [
  ["Rechnung", "Invoice"],
  ["Rechnungsnummer", "Invoice number"],
  ["Zahlungsziel", "Payment due date"],
  ["Zu zahlen", "Amount due"],
  ["Grundgebühr", "Base fee"],
  ["Monat", "Month"],
  ["Einmal", "One-time"],
  ["Technische Leistung", "Technical service"],
  ["Fehlerbehebung", "Troubleshooting"],
  ["Heimnetz", "Home network"],
  ["Endgeräte", "Devices"],
  ["Servicepaket", "Service package"],
  ["Bereitstellung", "Provisioning"],
  ["Router", "Router"],
  ["Speedport", "Speedport"],
  ["MagentaZuhause", "MagentaZuhause"],
  ["Gutschrift", "Credit"],
  ["Rabatt", "Discount"],
  ["MwSt", "VAT"],
];

function translateGlossary(de) {
  let en = de;
  for (const [a, b] of GLOSSARY) {
    // replace whole words / parts
    en = en.replaceAll(a, b);
  }
  // wenn nix „greift“, wenigstens so lassen (besser als leer)
  if (en === de) return `${de} (EN)`;
  return en;
}

function explainEN(de, type) {
  if (type === "monthly") return "Likely a recurring monthly charge (glossary-based).";
  if (type === "one_time") return "Likely a one-time charge (glossary-based).";
  if (type === "usage") return "Likely usage-based charge (calls/SMS/data) (glossary-based).";
  if (type === "tax") return "Tax/VAT related line (glossary-based).";
  return "Line item detected from PDF text (rule-based).";
}

function trafficLight({ docType, totalAmount, dueDate, items }) {
  const reasons = [];
  let score = 80; // 0..100 (höher = besser)
  let status = "green";

  const isReminder = (docType || "").toLowerCase().includes("mahnung") || (docType || "").toLowerCase().includes("zahlungserinnerung");
  if (isReminder) {
    status = "red";
    score = 20;
    reasons.push("Mahn-/Zahlungserinnerung erkannt → dringend prüfen/bezahlen.");
    return { status, score, reasons };
  }

  const totalNum = toNumberEuro(totalAmount);
  if (totalNum != null) {
    if (totalNum >= 150) {
      status = "yellow";
      score = Math.min(score, 55);
      reasons.push("Hoher Rechnungsbetrag (regelbasiert).");
    } else {
      reasons.push("Rechnung erkannt (kein Mahndokument).");
    }
  } else {
    status = "yellow";
    score = Math.min(score, 60);
    reasons.push("Gesamtbetrag nicht sicher erkannt.");
  }

  if (dueDate) {
    reasons.push(`Zahlungsziel erkannt: ${dueDate}`);
  } else {
    status = "yellow";
    score = Math.min(score, 60);
    reasons.push("Zahlungsziel nicht erkannt (kann im PDF fehlen).");
  }

  if (!items || items.length === 0) {
    status = "yellow";
    score = Math.min(score, 55);
    reasons.push("Keine Einzelpositionen erkannt (PDF-Format/Scan möglich).");
  } else {
    reasons.push(`${items.length} Positionen erkannt.`);
  }

  if (status === "green" && score < 70) status = "yellow";
  return { status, score, reasons };
}

export function parseTelecomDoc({ text, fileName }) {
  const provider = detectProvider(text, fileName);
  const document_type = detectDocType(text);

  // allgemeine Extraktion (best effort)
  const invoice_number =
    firstMatch(text, /Rechnungsnummer\s*([0-9\s]+)/i) ||
    firstMatch(text, /Rechnung\s*Nr\.?\s*([0-9\s]+)/i) ||
    "";

  const invoice_date =
    firstMatch(text, /Datum\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    firstMatch(text, /Rechnungsdatum\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  const billing_period =
    firstMatch(text, /(Zeitraum|Abrechnungszeitraum)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4}\s*(?:-|–|bis)\s*\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  const total_amount =
    formatEuro(firstMatch(text, /(Zu zahlender Betrag|Zu zahlen)\s*[:\-]?\s*([\d\.,]+)\s*€?/i)) ||
    "";

  const outstanding_amount =
    formatEuro(firstMatch(text, /(Offener Betrag|Noch offen|Zahlbetrag)\s*[:\-]?\s*([\d\.,]+)\s*€?/i)) ||
    "";

  const payment_due =
    firstMatch(text, /(Zahlungsziel|Fällig am|Bitte zahlen bis)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  // Kündbarkeit/Frist (best effort)
  const cancelable_from =
    firstMatch(text, /(kündbar ab|Kündigung möglich ab)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    firstMatch(text, /(Vertragsende|Mindestlaufzeit bis)\s*[:\-]?\s*(\d{2}\.\d{2}\.\d{4})/i) ||
    "";

  const notice_period =
    firstMatch(text, /(Kündigungsfrist)\s*[:\-]?\s*([^\n\r]+)/i) || "";

  // IBAN/BIC best effort
  const iban = firstMatch(text, /(IBAN)\s*[:\-]?\s*([A-Z]{2}\d{2}[A-Z0-9\s]{10,})/i) || "";
  const bic = firstMatch(text, /(BIC)\s*[:\-]?\s*([A-Z0-9]{8,11})/i) || "";

  const recipient =
    firstMatch(text, /(Empfänger|Begünstigter)\s*[:\-]?\s*([^\n\r]+)/i) ||
    "";

  const purpose =
    invoice_number ? `Invoice ${normSpaces(invoice_number)}` : "";

  const items = extractItems(text);

  const traffic_light = trafficLight({
    docType: document_type,
    totalAmount: total_amount || outstanding_amount,
    dueDate: payment_due,
    items
  });

  const next_actions = [];
  if (document_type.includes("Mahnung")) {
    next_actions.push({ title: "Pay now", text: "This is a reminder. Pay the outstanding amount promptly." });
  } else {
    next_actions.push({ title: "Check due date", text: "Verify the payment due date and pay on time." });
    if (cancelable_from) next_actions.push({ title: "Cancelability", text: "A possible cancelability date was detected. Consider reviewing your contract." });
  }

  const payment = {
    iban: normSpaces(iban),
    bic: normSpaces(bic),
    recipient: normSpaces(recipient),
    purpose: purpose,
    how_to_pay_en: "Transfer the amount using the invoice number as payment reference (rule-based)."
  };

  const warnings = [];
  if (!iban && !bic) warnings.push("Keine Bankdaten (IBAN/BIC) sicher erkannt – kann je nach Anbieter/Format fehlen.");
  if (!invoice_number) warnings.push("Rechnungsnummer nicht sicher erkannt.");
  if (!total_amount && !outstanding_amount) warnings.push("Betrag nicht sicher erkannt (prüfe die PDF-Textqualität).");

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
    payment,
    items,
    traffic_light,
    warnings,
    next_actions
  };
}

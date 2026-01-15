import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { parseTelecomDoc } from "../../lib/parser";

export const config = { api: { bodyParser: false } };

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });

    let fileBuffer = Buffer.alloc(0);
    let fileName = "upload.pdf";
    let mimeType = "application/pdf";

    bb.on("file", (_name, file, info) => {
      fileName = info.filename || fileName;
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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const { fileBuffer, fileName, mimeType } = await parseMultipart(req);

    // Kostenlos: nur PDF
    if (!(mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf"))) {
      return res.status(400).json({ error: "In der kostenlosen Testphase ist nur PDF erlaubt." });
    }

    const parsed = await pdfParse(fileBuffer);
    const text = (parsed.text || "").trim();

    // Wenn PDF kein Text enthält (Scan)
    if (!text) {
      const fallback = {
        provider: "Unbekannt",
        document_type: "Unbekannt",
        invoice_number: "",
        invoice_date: "",
        billing_period: "",
        total_amount: "",
        outstanding_amount: "",
        payment_due: "",
        cancelable_from: "",
        notice_period: "",
        payment: { iban: "", bic: "", recipient: "", purpose: "", how_to_pay_en: "" },
        items: [],
        warnings: [
          "In diesem PDF ist kein kopierbarer Text gefunden (wahrscheinlich Scan).",
          "Kostenlos-Test unterstützt nur textbasierte PDFs. Für Scans/Screenshots brauchst du später OCR/KI."
        ],
        traffic_light: {
          status: "yellow",
          score: 50,
          reasons: [
            "PDF enthält keinen Text → keine sichere Extraktion möglich (kostenlos)."
          ]
        },
        next_actions: [
          { title: "Tipp", text: "Teste mit einer textbasierten PDF (Text in der PDF markierbar)." }
        ]
      };
      return res.status(200).json(fallback);
    }

    const result = parseTelecomDoc({ text, fileName });

    // Debug nur minimal, damit du bei Vorführung nicht viel Text hast
    result.warnings = result.warnings || [];
    if (text.length < 500) {
      result.warnings.push("Sehr wenig Text erkannt – Ergebnisse können unvollständig sein.");
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

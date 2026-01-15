import PDFDocument from "pdfkit";

export const config = { api: { bodyParser: true } };
function safe(v) { return v == null ? "" : String(v); }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
    const { result } = req.body || {};
    if (!result) return res.status(400).json({ error: "Missing result" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="rechnungs-check_ergebnis.pdf"');

    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.pipe(res);

    doc.fontSize(18).text("Rechnungs-Check Ergebnis (kostenlose PDF-Demo)", { underline: true });
    doc.moveDown(0.8);

    doc.fontSize(11).fillColor("#111");
    doc.text(`Provider: ${safe(result.provider)}`);
    doc.text(`Dokumenttyp: ${safe(result.document_type)}`);
    doc.text(`Rechnungsnummer: ${safe(result.invoice_number)}`);
    doc.text(`Rechnungsdatum: ${safe(result.invoice_date)}`);
    doc.text(`Zeitraum: ${safe(result.billing_period)}`);
    doc.text(`Zu zahlen: ${safe(result.total_amount)}`);
    doc.text(`Offen (Mahnung): ${safe(result.outstanding_amount)}`);
    doc.text(`Zahlungsziel: ${safe(result.payment_due)}`);
    doc.text(`Kündbar ab: ${safe(result.cancelable_from)}`);
    doc.text(`Kündigungsfrist: ${safe(result.notice_period)}`);

    doc.moveDown(0.8);
    const tl = result.traffic_light || {};
    doc.fontSize(12).text(`Ampel: ${safe(tl.status).toUpperCase()} (Score ${safe(tl.score)}/100)`);
    (tl.reasons || []).forEach(r => doc.fontSize(10).text(`- ${safe(r)}`));

    if (Array.isArray(result.warnings) && result.warnings.length) {
      doc.moveDown(0.6);
      doc.fontSize(12).text("Hinweise", { underline: true });
      result.warnings.slice(0, 10).forEach(w => doc.fontSize(10).text(`- ${safe(w)}`));
    }

    doc.moveDown(0.8);
    doc.fontSize(13).text("Positionen (DE -> EN)", { underline: true });
    doc.moveDown(0.4);

    const items = Array.isArray(result.items) ? result.items : [];
    items.slice(0, 25).forEach((it, idx) => {
      doc.fontSize(10).fillColor("#111").text(`${idx + 1}. ${safe(it.de)}  (${safe(it.amount)})`);
      doc.fillColor("#333").text(`   EN: ${safe(it.en)}`);
      if (it.explain_en) doc.fillColor("#555").text(`   Note: ${safe(it.explain_en)}`);
      doc.moveDown(0.2);
    });

    doc.moveDown(0.6);
    doc.fontSize(13).fillColor("#111").text("Zahlungsdetails", { underline: true });
    const p = result.payment || {};
    doc.fontSize(10).text(`Empfänger: ${safe(p.recipient)}`);
    doc.text(`IBAN: ${safe(p.iban)}`);
    doc.text(`BIC: ${safe(p.bic)}`);
    doc.text(`Verwendungszweck: ${safe(p.purpose)}`);
    doc.text(`How to pay (EN): ${safe(p.how_to_pay_en)}`);

    if (Array.isArray(result.next_actions) && result.next_actions.length) {
      doc.moveDown(0.6);
      doc.fontSize(13).fillColor("#111").text("Empfehlungen", { underline: true });
      result.next_actions.slice(0, 10).forEach(a => {
        doc.fontSize(10).fillColor("#111").text(`- ${safe(a.title)}: ${safe(a.text)}`);
      });
    }

    doc.end();
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

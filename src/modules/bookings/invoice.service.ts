import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { BookingDoc } from "../../types/models.js";

const ACCENT = "#c8872e";
const INK = "#1c1a17";
const MUTED = "#6b6560";

const money = (value: number) => `$${value.toFixed(2)}`;

function row(doc: PDFKit.PDFDocument, label: string, value: string, y: number, bold = false) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? INK : MUTED).fontSize(bold ? 12 : 11);
  doc.text(label, 50, y, { width: 330 });
  doc.fillColor(INK).text(value, 380, y, { width: 165, align: "right" });
}

export function streamInvoice(booking: BookingDoc, res: Response) {
  const invoiceNo = `SS-${booking._id.toString().slice(-8).toUpperCase()}`;
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${invoiceNo}` } });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="studiospace-${invoiceNo}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 8).fill(ACCENT);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(24).text("StudioSpace", 50, 50);
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("Booking receipt", 50, 80);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(invoiceNo, 380, 54, { width: 165, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED)
    .text(`Issued ${new Date().toISOString().slice(0, 10)}`, 380, 72, { width: 165, align: "right" });

  doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#e3ddd4").stroke();

  doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT).text("STUDIO", 50, 130);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(booking.studioTitle, 50, 146, { width: 300 });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(booking.studioLocation, 50, 166, { width: 300 });

  doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT).text("BILLED TO", 380, 130);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(booking.userName || "Guest", 380, 146, { width: 165 });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(booking.userEmail, 380, 164, { width: 165 });

  doc.font("Helvetica-Bold").fontSize(10).fillColor(ACCENT).text("SESSION", 50, 220);
  doc.font("Helvetica").fontSize(11).fillColor(INK).text(
    `${booking.date}  ·  ${booking.startTime} – ${booking.endTime}  ·  ${booking.hours} hr  ·  ${booking.guests} guest${booking.guests === 1 ? "" : "s"}`,
    50,
    236,
  );
  doc.fontSize(10).fillColor(MUTED).text(`Status: ${booking.status}`, 50, 256);

  doc.moveTo(50, 290).lineTo(545, 290).strokeColor("#e3ddd4").stroke();
  row(doc, `Studio time (${booking.hours} hr × ${money(booking.hourlyRate)})`, money(booking.subtotal), 308);
  row(doc, "Refundable security deposit", money(booking.securityDeposit), 332);
  doc.moveTo(50, 362).lineTo(545, 362).strokeColor("#e3ddd4").stroke();
  row(doc, "Total", money(booking.total), 376, true);

  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(
    "The security deposit is returned after the session when the space is left in its original condition. " +
      "Thank you for booking with StudioSpace.",
    50,
    430,
    { width: 495 },
  );

  doc.end();
}

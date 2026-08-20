import PDFDocument from 'pdfkit';
import { toIndianCurrencyWords } from './number-to-words';

export interface ReceiptData {
  receiptNumber: string;
  societyName: string;
  societyAddress: string;
  residentName: string;
  flatLabel: string;
  date: Date;
  transactionType: 'DEPOSIT';
  purpose: string;
  amount: number;
  // Chairman/secretary signatories (2026-08-17: replaced the single treasurer
  // signatory this receipt used to show — see CLAUDE.md's "Receipt now signed by
  // Chairman and Secretary" addendum). Either may be absent (role unassigned).
  chairmanName?: string;
  secretaryName?: string;
  footerNote?: string;
}

// The two signature images (if any) a receipt is rendered with — keyed by role,
// not a single generic slot, since both blocks render side by side regardless of
// whether either image exists (see drawSignatoryBlock's blank-line fallback).
export interface ReceiptSignatures {
  chairman?: Buffer;
  secretary?: Buffer;
}

// Draws one signatory block (signature image or blank line, then name, then role
// label) at a fixed x/width, and returns the y just past its bottom edge — used to
// lay out the Chairman and Secretary blocks side by side and then position the
// footer note below whichever one runs taller (a missing name still reserves the
// same vertical space via the non-breaking-space fallback, so the two blocks stay
// visually aligned even when only one role is assigned).
function drawSignatoryBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  name: string | undefined,
  signatureBuffer: Buffer | undefined,
): number {
  let sigY = y;

  const drawBlankLine = () => {
    doc
      .strokeColor(COLOR.ink)
      .lineWidth(1)
      .moveTo(x, sigY + 18)
      .lineTo(x + width, sigY + 18)
      .stroke();
    sigY += 23;
  };

  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, x, sigY, { fit: [width, 45], align: 'center' });
      sigY += 50;
    } catch {
      // A corrupt/unreadable signature buffer must never block a receipt from
      // rendering — fall back to the blank-line signatory block below.
      drawBlankLine();
    }
  } else {
    drawBlankLine();
  }

  doc.fillColor(COLOR.ink).fontSize(10).font('Helvetica-Bold');
  doc.text(name ?? ' ', x, sigY, { width, align: 'center' });
  sigY = doc.y;

  doc.fillColor(COLOR.muted).fontSize(9).font('Helvetica');
  doc.text(title, x, sigY + 1, { width, align: 'center' });
  return doc.y;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TRANSACTION_TYPE_LABEL: Record<ReceiptData['transactionType'], string> = {
  DEPOSIT: 'Deposit',
};

// Mirrors client/src/index.css's `@theme` tokens, so the issued PDF reads as
// the same visual identity as the rest of the app (the reference layout this
// was redesigned against) instead of an unrelated invented palette.
const COLOR = {
  ink: '#182420',
  muted: '#8a9088',
  teal: '#2f6e64',
  brass: '#b8863a',
  brassLight: '#e8d4ac',
  line: '#d9dfd5',
  paper: '#f3f5f0',
};

// No real society-logo upload exists in this app (only a signature image, see
// Society.receiptSignatureFileKey) — this small stylised "receipt" glyph
// (folded-corner page + text lines in a rounded brass badge) fills that slot
// instead of leaving the header blank.
function drawLogoMark(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc.roundedRect(x, y, size, size, size * 0.22).fill(COLOR.brass);

  const pad = size * 0.26;
  const iw = size - pad * 2;
  const ih = size - pad * 2;
  const fold = iw * 0.32;
  const px = x + pad;
  const py = y + pad;

  doc
    .moveTo(px, py)
    .lineTo(px + iw - fold, py)
    .lineTo(px + iw, py + fold)
    .lineTo(px + iw, py + ih)
    .lineTo(px, py + ih)
    .closePath()
    .fill('#ffffff');

  doc
    .moveTo(px + iw - fold, py)
    .lineTo(px + iw, py + fold)
    .lineTo(px + iw - fold, py + fold)
    .closePath()
    .fill(COLOR.brassLight);

  doc.strokeColor(COLOR.brass).lineWidth(1);
  for (let i = 0; i < 3; i++) {
    const ly = py + fold + 4 + i * 3.5;
    doc
      .moveTo(px + 2, ly)
      .lineTo(px + iw - 3, ly)
      .stroke();
  }
}

// Redesigned to match the confirmed reference layout (a bordered "card":
// logo + society letterhead and receipt number up top, received-from/date
// row, a shaded type/towards/amount panel, signature block at the bottom) —
// same ReceiptData contract and content as before, only the presentation
// changed. Streams into a Buffer rather than a file path since the caller
// decides where the bytes end up (StorageAdapter.save, or straight to an
// HTTP response for the pre-approval preview) — see receipt.service.ts.
export async function renderReceiptPdf(
  data: ReceiptData,
  signatures?: ReceiptSignatures,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginX = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header: logo + society name/address (left), receipt number (right) ---
    const headerTop = doc.page.margins.top;
    const logoSize = 30;
    drawLogoMark(doc, marginX, headerTop, logoSize);

    const receiptBlockWidth = 130;
    const nameX = marginX + logoSize + 10;
    const nameWidth = contentWidth - logoSize - 10 - receiptBlockWidth;

    doc.fillColor(COLOR.ink).font('Times-Bold').fontSize(17);
    doc.text(data.societyName, nameX, headerTop - 2, { width: nameWidth });
    const nameBottom = doc.y;

    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9);
    doc.text(data.societyAddress, nameX, nameBottom + 2, { width: nameWidth });
    const addressBottom = doc.y;

    const receiptBlockX = marginX + contentWidth - receiptBlockWidth;
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8);
    doc.text('RECEIPT NO.', receiptBlockX, headerTop, { width: receiptBlockWidth, align: 'right' });
    const receiptLabelBottom = doc.y;

    // No `width` option here (unlike the other right-aligned fields below) —
    // a receipt number is an identifier, not prose, and must never wrap
    // mid-string. Right-edge alignment is computed manually via
    // widthOfString instead, growing left of the receipt block as needed for
    // long ids rather than breaking the string across lines.
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10);
    const receiptNoWidth = doc.widthOfString(data.receiptNumber);
    const receiptNoRight = marginX + contentWidth;
    doc.text(data.receiptNumber, receiptNoRight - receiptNoWidth, receiptLabelBottom + 2);
    const receiptNoBottom = doc.y;

    let y = Math.max(addressBottom, receiptNoBottom, headerTop + logoSize) + 14;

    doc
      .strokeColor(COLOR.ink)
      .lineWidth(1.2)
      .moveTo(marginX, y)
      .lineTo(marginX + contentWidth, y)
      .stroke();
    y += 18;

    // --- Received from / Date ---
    const leftColWidth = contentWidth * 0.6;
    const rightColX = marginX + leftColWidth;
    const rightColWidth = contentWidth - leftColWidth;

    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8);
    doc.text('RECEIVED FROM', marginX, y, { width: leftColWidth });
    doc.text('DATE', rightColX, y, { width: rightColWidth, align: 'right' });
    y = doc.y + 3;

    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12);
    doc.text(data.residentName, marginX, y, { width: leftColWidth });
    const residentBottom = doc.y;
    doc.text(formatDate(data.date), rightColX, y, { width: rightColWidth, align: 'right' });
    const dateBottom = doc.y;

    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(9);
    doc.text(data.flatLabel, marginX, residentBottom + 2, { width: leftColWidth });
    const flatBottom = doc.y;

    y = Math.max(flatBottom, dateBottom) + 20;

    // --- Shaded panel: type / towards / amount ---
    const boxPad = 14;
    const boxWidth = contentWidth;
    const labelWidth = 90;
    const valueWidth = boxWidth - boxPad * 2 - labelWidth;
    const rowGap = 10;

    doc.font('Helvetica').fontSize(10);
    const towardsHeight = Math.max(
      14,
      doc.heightOfString(data.purpose, { width: valueWidth, align: 'right' }),
    );

    doc.font('Helvetica-Bold').fontSize(15);
    const amountText = `Rs. ${data.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const amountHeight = doc.heightOfString(amountText, { width: valueWidth, align: 'right' });

    const wordsWidth = boxWidth - boxPad * 2;
    doc.font('Helvetica-Oblique').fontSize(9);
    const wordsText = toIndianCurrencyWords(data.amount);
    const wordsHeight = doc.heightOfString(wordsText, { width: wordsWidth });

    const boxHeight =
      boxPad +
      14 /* type row */ +
      rowGap +
      towardsHeight +
      rowGap +
      1 /* divider */ +
      rowGap +
      Math.max(16, amountHeight) +
      6 +
      wordsHeight +
      boxPad;

    doc
      .lineWidth(1)
      .roundedRect(marginX, y, boxWidth, boxHeight, 10)
      .fillAndStroke(COLOR.paper, COLOR.line);

    const labelX = marginX + boxPad;
    const valX = labelX + labelWidth;
    let by = y + boxPad;

    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10);
    doc.text('Type', labelX, by, { width: labelWidth });
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10);
    doc.text(TRANSACTION_TYPE_LABEL[data.transactionType], valX, by, {
      width: valueWidth,
      align: 'right',
    });
    by += 14 + rowGap;

    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(10);
    doc.text('Towards', labelX, by, { width: labelWidth });
    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(10);
    doc.text(data.purpose, valX, by, { width: valueWidth, align: 'right' });
    by += towardsHeight + rowGap;

    doc
      .strokeColor(COLOR.line)
      .lineWidth(1)
      .moveTo(labelX, by)
      .lineTo(marginX + boxWidth - boxPad, by)
      .stroke();
    by += rowGap;

    doc.fillColor(COLOR.ink).font('Helvetica-Bold').fontSize(12);
    doc.text('Amount', labelX, by, { width: labelWidth });
    doc.fillColor(COLOR.teal).font('Helvetica-Bold').fontSize(15);
    doc.text(amountText, valX, by - 2, { width: valueWidth, align: 'right' });
    by += Math.max(16, amountHeight) + 6;

    doc.fillColor(COLOR.muted).font('Helvetica-Oblique').fontSize(9);
    doc.text(wordsText, labelX, by, { width: wordsWidth });

    y = y + boxHeight + 40;

    // --- Signatory blocks: Chairman (left) and Secretary (right) — replaced the
    // former single right-aligned treasurer block (2026-08-17). Each block's image
    // (if any) sits directly above its name, replacing the blank line, same as the
    // original single-signatory spec's requirement, just applied to two blocks.
    const blockWidth = 150;
    const chairmanX = marginX;
    const secretaryX = marginX + contentWidth - blockWidth;

    const chairmanBottom = drawSignatoryBlock(
      doc,
      chairmanX,
      y,
      blockWidth,
      'Chairman',
      data.chairmanName,
      signatures?.chairman,
    );
    const secretaryBottom = drawSignatoryBlock(
      doc,
      secretaryX,
      y,
      blockWidth,
      'Secretary',
      data.secretaryName,
      signatures?.secretary,
    );
    const sigBottom = Math.max(chairmanBottom, secretaryBottom);

    if (data.footerNote) {
      doc.fillColor(COLOR.muted).fontSize(8).font('Helvetica-Oblique');
      doc.text(data.footerNote, marginX, sigBottom + 30, { width: contentWidth, align: 'center' });
    }

    doc.end();
  });
}

import PDFDocument from 'pdfkit';
import { toIndianCurrencyWords } from './number-to-words';

export interface ReceiptData {
  receiptNumber: string;
  societyName: string;
  societyAddress: string;
  residentName: string;
  flatLabel: string;
  date: Date;
  transactionType: 'DEPOSIT' | 'CREDIT';
  purpose: string;
  amount: number;
  signatoryName?: string;
  signatoryTitle?: string;
  footerNote?: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TRANSACTION_TYPE_LABEL: Record<ReceiptData['transactionType'], string> = {
  DEPOSIT: 'Payment (Deposit)',
  CREDIT: 'Credit Adjustment',
};

// Pure rendering — deliberately takes the signature as an already-fetched Buffer
// rather than reading it from storage itself (see receipt.service.ts's
// getSignatureBufferOrUndefined), so this file stays IO-free and independently
// unit-testable, same as lib/upi.ts. Streams into a Buffer rather than a file path
// since the caller decides where the bytes end up (StorageAdapter.save, or straight
// to an HTTP response for the pre-approval preview).
export async function renderReceiptPdf(data: ReceiptData, signatureBuffer?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(data.societyName, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(data.societyAddress, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(10).font('Helvetica');
    doc.text(`Receipt No: ${data.receiptNumber}`);
    doc.text(`Date: ${formatDate(data.date)}`);
    doc.moveDown(1);

    doc.text(`Received from: ${data.residentName}`);
    doc.text(`Flat: ${data.flatLabel}`);
    doc.text(`Transaction type: ${TRANSACTION_TYPE_LABEL[data.transactionType]}`);
    doc.text(`Towards: ${data.purpose}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text(`Amount: Rs. ${data.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    doc.font('Helvetica').fontSize(9).text(`In words: ${toIndianCurrencyWords(data.amount)}`);
    doc.moveDown(2.5);

    // Signatory block, right-aligned. The image (if any) sits directly above the
    // name — replacing the blank line, per the spec's "displays above the
    // signatory name... replacing the blank signature line" requirement.
    const blockWidth = 200;
    const blockX = doc.page.width - doc.page.margins.right - blockWidth;
    const blockStartY = doc.y;

    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, blockX, blockStartY, { fit: [blockWidth, 50], align: 'center' });
        doc.y = blockStartY + 55;
      } catch {
        // A corrupt/unreadable signature buffer must never block a receipt from
        // rendering — fall back to the blank-line signatory block below.
        doc.y = blockStartY;
        doc
          .moveTo(blockX, doc.y + 20)
          .lineTo(blockX + blockWidth, doc.y + 20)
          .stroke();
        doc.y = doc.y + 25;
      }
    } else {
      doc
        .moveTo(blockX, doc.y + 20)
        .lineTo(blockX + blockWidth, doc.y + 20)
        .stroke();
      doc.y = doc.y + 25;
    }

    if (data.signatoryName) {
      doc.fontSize(10).font('Helvetica-Bold').text(data.signatoryName, blockX, doc.y, { width: blockWidth, align: 'center' });
    }
    if (data.signatoryTitle) {
      doc.fontSize(9).font('Helvetica').text(data.signatoryTitle, blockX, doc.y, { width: blockWidth, align: 'center' });
    }

    if (data.footerNote) {
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica-Oblique').text(data.footerNote, { align: 'center' });
    }

    doc.end();
  });
}

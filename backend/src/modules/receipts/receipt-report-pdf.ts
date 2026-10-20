import PDFDocument from 'pdfkit';

export interface ReceiptReportInput {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  rawText?: string;
  originalUrl: string;
  originalBuffer?: Buffer;
  originalMimetype?: string;
}

const BRAND = '#00627F';

/** Builds a PDF containing the extracted fields plus either the embedded receipt image or a link to the original file. */
export function buildReceiptReportPdf(input: ReceiptReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).fillColor(BRAND).text('Rabbit Tracker — Receipt Report');
    doc.fontSize(9).fillColor('#888888').text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1.2);

    doc.fontSize(13).fillColor('#111111').text('Extracted details');
    doc.moveDown(0.4);

    const row = (label: string, value: string) => {
      doc.fontSize(10).fillColor('#555555').text(`${label} `, { continued: true });
      doc.fillColor('#111111').text(value || '—');
      doc.moveDown(0.2);
    };

    row('Merchant:', input.merchant ?? '—');
    row('Amount:', input.amount !== null ? `$${input.amount.toFixed(2)}` : '—');
    row('Date:', input.date ?? '—');
    row('Category:', input.category ?? '—');
    row('Description:', input.description ?? '—');

    doc.moveDown(1);

    const isImage = (input.originalMimetype ?? '').startsWith('image/');
    if (isImage && input.originalBuffer) {
      doc.fontSize(13).fillColor('#111111').text('Original receipt');
      doc.moveDown(0.4);
      try {
        doc.image(input.originalBuffer, { fit: [500, 400], align: 'center' });
      } catch {
        doc.fontSize(10).fillColor('#DC2626').text('(could not embed the original image)');
      }
    } else {
      doc.fontSize(13).fillColor('#111111').text('Original file');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(BRAND).text(input.originalUrl, { link: input.originalUrl, underline: true });
    }

    if (input.rawText?.trim()) {
      doc.moveDown(1.2);
      doc.fontSize(13).fillColor('#111111').text('Extracted text');
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor('#444444').text(input.rawText.slice(0, 3000));
    }

    doc.end();
  });
}
